import {
  STORAGE_KEYS, MARKAZ_INFO, ROLES, DAYS, HOLIDAYS, DOMICILES, DEMO_ACCOUNTS,
  STATUS_LABELS, BRAND_LOGO_SVG, icon, now, createId, escapeHtml, safeUrl,
  toEmbedUrl, cairoDate, isDateKey, weekday, addDays, formatDate,
  initializeDatabase, getDatabase, mutateDatabase, upsertRow, reserveNia,
  currentUser, requireRole, login, clearSession, getActiveEnrollments,
  canTeach, canAccessMaterial, requiredWeekdays, saveLargeVideoFile,
  deleteLargeVideoFile, acquireVideoSource, createBackup, validateBackup,
  restoreBackup
} from './config.js';
import { initMotionEnhancements } from './motion.js';
import { sheetsSections, mountSheets, disconnectSheets } from './student-sheets.js';

const e = escapeHtml;
const byId = (rows, id) => rows.find(row => row.id === id);
const label = status => STATUS_LABELS[status] || status;
const archivePrefix = '[Arsip] ';
function assert(condition, message) { if (!condition) throw new Error(message); }
function text(value, name, max = 200, optional = false) {
  const result = String(value ?? '').trim();
  assert((optional || result.length > 0) && result.length <= max, `${name} wajib diisi dengan panjang maksimal ${max} karakter.`);
  return result;
}
function email(value) {
  const result = text(value, 'Email', 254).toLowerCase();
  assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result), 'Alamat email tidak valid.');
  return result;
}
function phone(value) {
  const result = String(value ?? '').replace(/[\s()+.-]/g, '');
  assert(/^\d{8,16}$/.test(result), 'Nomor WhatsApp harus berisi 8–16 digit. Gunakan kode negara.');
  return result;
}
function password(value) {
  const result = String(value ?? '');
  assert(result.length >= 6 && result.length <= 128, 'Kata sandi harus 6–128 karakter.');
  return result;
}
function url(value, name = 'Tautan') {
  const result = String(value ?? '').trim();
  assert(!result || safeUrl(result), `${name} harus berupa URL HTTP atau HTTPS yang valid.`);
  return result;
}
function commit(roles, action, revision) {
  assert(!restoreBusy, 'Tunggu proses restore selesai.');
  const actor = requireRole(...roles);
  let result;
  mutateDatabase(db => {
    const user = byId(db.tables.users, actor.id);
    assert(user?.status === 'active' && roles.includes(user.role), 'Sesi atau akses akun berubah. Silakan masuk kembali.');
    result = action(db, user);
  }, revision);
  return result;
}
function activeProgramSubjects(db, programId) {
  return db.tables.programSubjects.filter(row => row.programId === programId && row.active).map(row => row.subjectId);
}
function enrolledSubject(db, enrollment, subjectId) {
  return db.tables.enrollmentSubjects.some(row => row.enrollmentId === enrollment.id && row.subjectId === subjectId);
}
function enrollmentValid(enrollment, date) {
  return enrollment?.status === 'active' && enrollment.startDate <= date && (!enrollment.endDate || enrollment.endDate >= date);
}
function isStaff(user) { return ['admin', 'executive'].includes(user?.role); }
export function canViewMaterial(user, material, db = getDatabase()) {
  if (!user || !material || user.status !== 'active') return false;
  if (isStaff(user)) return true;
  if (user.role === 'student') return canAccessMaterial(user.id, material, db);
  return user.role === 'teacher' && (material.teacherId === user.id ||
    (!material.general && canTeach(user.id, material.programId, material.subjectId, db)) ||
    (material.general && db.tables.assignments.some(a => a.teacherId === user.id && a.active && (!material.programId || a.programId === material.programId))));
}

// Akun dasar aktif langsung; program dibeli melalui enrollment terpisah.
export function registerStudent(input) {
  const data = {
    name: text(input.name, 'Nama lengkap', 150), email: email(input.email),
    phone: phone(input.phone), domicile: text(input.domicile, 'Domisili Kairo', 120),
    password: password(input.password)
  };
  let id;
  mutateDatabase(db => {
    assert(!db.tables.users.some(u => u.email.toLowerCase() === data.email), 'Email sudah terdaftar. Silakan masuk.');
    id = createId('student');
    upsertRow(db, 'users', {...data, id, nia: reserveNia(db), code: '', role: 'student', status: 'active', title: ''});
    upsertRow(db, 'ktaNames', {studentId: id, officialName: data.name, active: true});
  });
  return byId(getDatabase().tables.users, id);
}
export function submitEnrollment(input, revision) {
  return commit(['student'], (db, user) => {
    const program = byId(db.tables.programs, input.programId);
    const pack = byId(db.tables.packages, input.packageId);
    assert(program?.isOpen && pack?.isOpen && pack.programId === program.id, 'Program atau paket sudah ditutup. Pilih program yang masih dibuka.');
    assert(!db.tables.enrollments.some(item => item.studentId === user.id && item.programId === program.id &&
      (item.status === 'pending' || enrollmentValid(item, cairoDate()))), 'Kamu sudah memiliki pengajuan atau langganan aktif untuk program ini.');
    const available = activeProgramSubjects(db, program.id);
    const chosen = pack.mode === 'all' ? available : [...new Set(input.subjectIds || [])];
    assert(chosen.length > 0 && chosen.every(id => available.includes(id)), 'Pilih madah yang tersedia dalam program ini.');
    if (pack.mode === 'selected') assert(chosen.length >= pack.minSubjects && chosen.length <= pack.maxSubjects,
      `Pilih ${pack.minSubjects}–${pack.maxSubjects} madah sesuai paket.`);
    const enrollment = upsertRow(db, 'enrollments', {
      studentId: user.id, programId: program.id, packageId: pack.id, status: 'pending',
      requestedAt: now(), reviewedAt: '', reviewedBy: '', reviewNote: '', startDate: '', endDate: ''
    });
    chosen.forEach(subjectId => upsertRow(db, 'enrollmentSubjects', {enrollmentId: enrollment.id, subjectId}));
    return enrollment;
  }, revision);
}
export function reviewEnrollment(id, decision, input = {}, revision) {
  assert(['active', 'rejected'].includes(decision), 'Keputusan tidak valid.');
  return commit(['admin', 'executive'], (db, user) => {
    const item = byId(db.tables.enrollments, id);
    assert(item?.status === 'pending', 'Pengajuan sudah diproses atau tidak ditemukan.');
    const endDate = String(input.endDate || '');
    assert(!endDate || (isDateKey(endDate) && endDate >= cairoDate()), 'Tanggal akhir langganan tidak valid.');
    return upsertRow(db, 'enrollments', {
      ...item, status: decision, startDate: decision === 'active' ? cairoDate() : '',
      endDate: decision === 'active' ? endDate : '', reviewedAt: now(), reviewedBy: user.id,
      reviewNote: text(input.note, 'Catatan verifikasi', 2000, true)
    });
  }, revision);
}
export function saveLearning(materialId, patch) {
  return commit(['student'], (db, user) => {
    const material = byId(db.tables.materials, materialId);
    assert(material && canAccessMaterial(user.id, material, db), 'Akses materi ini tidak tersedia.');
    const old = db.tables.learning.find(row => row.studentId === user.id && row.materialId === materialId);
    const note = patch.note === undefined ? old?.note || '' : String(patch.note);
    assert(note.length <= 50000, 'Catatan maksimal 50.000 karakter.');
    return upsertRow(db, 'learning', {
      id: old?.id, studentId: user.id, materialId, note,
      done: patch.done === undefined ? old?.done || false : !!patch.done
    });
  });
}
export function teachingRoster(teacherId, programId, subjectId, date = cairoDate(), db = getDatabase()) {
  if (!canTeach(teacherId, programId, subjectId, db)) return [];
  return db.tables.enrollments.filter(item => item.programId === programId && enrollmentValid(item, date) && enrolledSubject(db, item, subjectId))
    .map(enrollment => ({enrollment, student: byId(db.tables.users, enrollment.studentId)}))
    .filter(row => row.student?.status === 'active')
    .sort((a, b) => a.student.name.localeCompare(b.student.name, 'id'));
}
export function saveAttendance(input, revision) {
  return commit(['teacher', 'executive'], (db, actor) => {
    const date = String(input.date || cairoDate());
    assert(isDateKey(date) && date <= cairoDate(), 'Absensi harus memakai tanggal Kairo hari ini atau sebelumnya.');
    assert(!HOLIDAYS.includes(weekday(date)), 'Jumat dan Sabtu hari libur resmi. Absensi streak tidak diisi pada hari libur.');
    assert(['hadir', 'izin', 'alpha'].includes(input.status), 'Status absensi tidak valid.');
    const teacherId = actor.role === 'teacher' ? actor.id : input.teacherId;
    const enrollment = byId(db.tables.enrollments, input.enrollmentId);
    assert(enrollmentValid(enrollment, date) && byId(db.tables.users, enrollment.studentId)?.status === 'active', 'Langganan santri tidak aktif pada tanggal ini.');
    assert(canTeach(teacherId, enrollment.programId, input.subjectId, db), 'Madah ini bukan penugasan guru yang dipilih.');
    assert(enrolledSubject(db, enrollment, input.subjectId), 'Santri tidak mengambil madah ini.');
    const assignmentIds = db.tables.assignments.filter(a => a.teacherId === teacherId && a.programId === enrollment.programId && a.subjectId === input.subjectId && a.active).map(a => a.id);
    assert(db.tables.schedules.some(s => s.active && assignmentIds.includes(s.assignmentId) && s.weekday === weekday(date)), 'Madah ini tidak dijadwalkan pada tanggal yang dipilih.');
    const old = db.tables.attendance.find(a => a.enrollmentId === enrollment.id && a.subjectId === input.subjectId && a.date === date);
    return upsertRow(db, 'attendance', {
      id: old?.id, studentId: enrollment.studentId, enrollmentId: enrollment.id,
      subjectId: input.subjectId, date, status: input.status, teacherId, countsForStreak: true
    });
  }, revision);
}
function dailyAttendance(records) {
  if (records.some(row => row.status === 'alpha')) return 'alpha';
  if (records.some(row => row.status === 'hadir')) return 'hadir';
  if (records.some(row => row.status === 'izin')) return 'izin';
  return 'waiting';
}
export function streakFor(studentId, db = getDatabase(), today = cairoDate()) {
  assert(isDateKey(today), 'Tanggal streak tidak valid.');
  const grouped = new Map();
  db.tables.attendance.filter(row => row.studentId === studentId && row.date <= today && row.countsForStreak && !HOLIDAYS.includes(weekday(row.date)))
    .forEach(row => grouped.set(row.date, [...(grouped.get(row.date) || []), row]));
  let count = 0;
  [...grouped.keys()].sort().forEach(date => {
    const status = dailyAttendance(grouped.get(date));
    if (status === 'alpha') count = 0;
    else if (status === 'hadir') count++;
  });
  const todayStatus = dailyAttendance(grouped.get(today) || []);
  let state = todayStatus;
  let message;
  if (HOLIDAYS.includes(weekday(today))) { state = 'freeze'; message = 'Streak Freeze · Hari Libur'; }
  else if (!getActiveEnrollments(studentId, db, today).length) { state = 'inactive'; message = 'Daftar program untuk memulai perjalanan istiqomah.'; }
  else if (!requiredWeekdays(studentId, db, today).includes(weekday(today))) { state = 'freeze'; message = 'Hari Tanpa Jadwal · Streak Aman'; }
  else message = {
    hadir: 'Hadir hari ini · Api istiqomah menyala!', alpha: 'Alpha hari ini · Mulai kembali pada pertemuan berikutnya.',
    izin: 'Izin tercatat · Streak aman tanpa tambahan hitungan.', waiting: 'Menunggu absensi guru · Belum dianggap Alpha.'
  }[todayStatus];
  const week = Array.from({length: 7}, (_, index) => {
    const date = addDays(today, index - 6), records = grouped.get(date) || [];
    const status = HOLIDAYS.includes(weekday(date)) ? 'freeze' : records.length ? dailyAttendance(records) :
      requiredWeekdays(studentId, db, date).includes(weekday(date)) ? 'waiting' : 'freeze';
    return {date, day: DAYS[weekday(date)], status};
  });
  return {count, state, message, week};
}
export function streakLeaderboard(db = getDatabase(), today = cairoDate()) {
  return db.tables.users.filter(u => u.role === 'student' && u.status === 'active')
    .map(user => ({id: user.id, name: user.name, nia: user.nia, ...streakFor(user.id, db, today)}))
    .filter(row => row.count > 0 || getActiveEnrollments(row.id, db, today).length)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'id')).slice(0, 5);
}
export function claimKta() {
  return commit(['student'], (db, user) => {
    const old = db.tables.ktaRequests.find(row => row.studentId === user.id);
    const name = db.tables.ktaNames.find(row => row.studentId === user.id && row.active);
    return upsertRow(db, 'ktaRequests', {
      id: old?.id, studentId: user.id, nameId: name?.id || '', gmail: old?.gmail || '',
      phone: old?.phone || user.phone, domicile: old?.domicile || user.domicile,
      status: 'active', source: 'self', requestedAt: old?.requestedAt || now(), whatsappOpenedAt: old?.whatsappOpenedAt || ''
    });
  });
}
export function submitKta(input, revision) {
  return commit(['student'], (db, user) => {
    const name = byId(db.tables.ktaNames, input.nameId);
    assert(name?.active && name.studentId === user.id, 'Pilih nama resmi milik akunmu dari master santri.');
    const gmail = email(input.gmail);
    assert(/@gmail\.com$/i.test(gmail), 'Gunakan alamat Gmail dengan akhiran @gmail.com.');
    const old = db.tables.ktaRequests.find(row => row.studentId === user.id);
    return upsertRow(db, 'ktaRequests', {
      id: old?.id, studentId: user.id, nameId: name.id, gmail,
      phone: phone(input.phone), domicile: text(input.domicile, 'Domisili Kairo', 120),
      status: 'requested', source: 'request', requestedAt: now(), whatsappOpenedAt: ''
    });
  }, revision);
}
export function ktaWhatsappLink(request, db = getDatabase()) {
  const student = byId(db.tables.users, request.studentId);
  const name = byId(db.tables.ktaNames, request.nameId);
  assert(student && name?.studentId === student.id, 'Data nama KTA tidak cocok.');
  const message = [
    "Assalamu'alaikum. Saya mengajukan pembuatan KTA Markaz At-Ta'allum.", '',
    `Nama Resmi: ${name.officialName}`, `NIA: ${student.nia}`, `Gmail: ${request.gmail}`,
    `No HP / WhatsApp: ${request.phone}`, `Domisili Kairo: ${request.domicile}`, '',
    "*⚠️ JANGAN LUPA LAMPIRKAN FOTO DIRI ANDA PADA CHAT INI UNTUK PEMBUATAN KTA MARKAZ AT-TA'ALLUM!*"
  ].join('\n');
  return `https://wa.me/${MARKAZ_INFO.ktaWhatsapp}?text=${encodeURIComponent(message)}`;
}
export function updateKtaStatus(studentId, status, revision) {
  assert(['missing', 'requested', 'printing', 'active'].includes(status), 'Status KTA tidak valid.');
  return commit(['admin', 'executive'], (db) => {
    const user = byId(db.tables.users, studentId);
    assert(user?.role === 'student', 'Santri tidak ditemukan.');
    const old = db.tables.ktaRequests.find(row => row.studentId === studentId);
    const name = db.tables.ktaNames.find(row => row.studentId === studentId && row.active);
    return upsertRow(db, 'ktaRequests', {
      id: old?.id, studentId, nameId: old?.nameId || name?.id || '', gmail: old?.gmail || '',
      phone: old?.phone || user.phone, domicile: old?.domicile || user.domicile,
      status, source: old?.source || 'admin', requestedAt: old?.requestedAt || now(), whatsappOpenedAt: old?.whatsappOpenedAt || ''
    });
  }, revision);
}
export function saveEvaluation(input, revision) {
  return commit(['teacher', 'executive'], (db, actor) => {
    const teacherId = actor.role === 'teacher' ? actor.id : input.teacherId;
    assert(canTeach(teacherId, input.programId, input.subjectId, db), 'Penugasan guru tidak sesuai.');
    const student = byId(db.tables.users, input.studentId);
    assert(student?.status === 'active' && student.role === 'student' && getActiveEnrollments(student.id, db).some(enrollment =>
      enrollment.programId === input.programId && enrolledSubject(db, enrollment, input.subjectId)), 'Santri tidak mengambil madah ini.');
    return upsertRow(db, 'evaluations', {
      studentId: student.id, teacherId, programId: input.programId, subjectId: input.subjectId,
      body: text(input.body, 'Catatan perkembangan', 4000)
    });
  }, revision);
}
export async function saveMaterial(input, file = null, revision) {
  const actor = requireRole('teacher', 'admin', 'executive');
  const base = getDatabase();
  const general = actor.role !== 'teacher' && !!input.general;
  const data = {
    title: text(input.title, 'Judul materi', 160), description: text(input.description, 'Deskripsi', 3000, true),
    programId: String(input.programId || ''), subjectId: general ? '' : String(input.subjectId || ''),
    teacherId: actor.role === 'teacher' ? actor.id : '', general, published: input.published !== false,
    videoUrl: url(input.videoUrl, 'URL video'), pdfUrl: url(input.pdfUrl, 'Link modul'), quizUrl: url(input.quizUrl, 'Link kuis')
  };
  const old = input.id ? byId(base.tables.materials, input.id) : null;
  assert(!input.id || old, 'Materi tidak ditemukan.');
  if (isStaff(actor) && old) data.teacherId = old.teacherId;
  assert(actor.role !== 'teacher' || !old || old.teacherId === actor.id, 'Guru hanya dapat mengubah unggahannya sendiri.');
  if (actor.role === 'teacher') assert(canTeach(actor.id, data.programId, data.subjectId, base), 'Pilih madah yang ditugaskan kepadamu.');
  if (!data.videoUrl && old && !file && input.keepVideo !== false) data.videoUrl = old.videoUrl;
  assert(!file || file.size > 0, 'File video kosong. Pilih file yang berisi rekaman.');
  assert(file?.size || data.videoUrl || data.pdfUrl || data.quizUrl, 'Isi video, modul PDF atau link kuis.');
  let stagedId;
  try {
    if (file?.size) {
      assert(file.type.startsWith('video/') || /\.(mp4|webm|ogg|mkv)$/i.test(file.name), 'Pilih file video yang valid.');
      stagedId = createId('video'); await saveLargeVideoFile(stagedId, file); data.videoUrl = `idb://${stagedId}`;
    }
    const result = commit(['teacher', 'admin', 'executive'], (db, user) => {
      assert(user.id === actor.id, 'Akun berubah selama pengunggahan.');
      const current = input.id ? byId(db.tables.materials, input.id) : null;
      assert(!input.id || current, 'Materi sudah dihapus.');
      if (user.role === 'teacher') assert(canTeach(user.id, data.programId, data.subjectId, db) && (!current || current.teacherId === user.id), 'Penugasan atau kepemilikan materi berubah.');
      return upsertRow(db, 'materials', {...data, id: input.id || createId('material')});
    }, revision ?? base.meta.revision);
    if (old?.videoUrl.startsWith('idb://') && old.videoUrl !== result.videoUrl && !getDatabase().tables.materials.some(m => m.videoUrl === old.videoUrl))
      await deleteLargeVideoFile(old.videoUrl.slice(6)).catch(() => {});
    return result;
  } catch (error) {
    if (stagedId) await deleteLargeVideoFile(stagedId).catch(() => {});
    throw error;
  }
}
export async function removeMaterial(id) {
  let removed;
  commit(['teacher', 'admin', 'executive'], (db, user) => {
    removed = byId(db.tables.materials, id);
    assert(removed && (isStaff(user) || removed.teacherId === user.id), 'Materi tidak ditemukan atau bukan unggahanmu.');
    db.tables.materials = db.tables.materials.filter(row => row.id !== id);
    db.tables.learning = db.tables.learning.filter(row => row.materialId !== id);
  });
  if (removed.videoUrl.startsWith('idb://') && !getDatabase().tables.materials.some(row => row.videoUrl === removed.videoUrl))
    await deleteLargeVideoFile(removed.videoUrl.slice(6)).catch(() => {});
}
export function saveAnnouncement(input, revision) {
  return commit(['admin', 'executive'], (db, user) => upsertRow(db, 'announcements', {
    id: input.id, title: text(input.title, 'Judul pengumuman', 160), body: text(input.body, 'Isi pengumuman', 5000),
    category: text(input.category || 'Informasi', 'Kategori', 100), published: input.published !== false, authorId: user.id
  }), revision);
}
export function removeAnnouncement(id) {
  return commit(['admin', 'executive'], db => { db.tables.announcements = db.tables.announcements.filter(row => row.id !== id); });
}
export function saveProgram(input, revision) {
  return commit(['executive'], db => upsertRow(db, 'programs', {
    id: input.id, name: text(input.name, 'Nama program', 150), description: text(input.description, 'Deskripsi', 1000, true), isOpen: !!input.isOpen
  }), revision);
}
export function savePackage(input, revision) {
  return commit(['executive'], db => {
    const old = input.id ? byId(db.tables.packages, input.id) : null;
    assert(byId(db.tables.programs, input.programId), 'Program tidak ditemukan.');
    assert(['all', 'selected'].includes(input.mode), 'Mode paket tidak valid.');
    assert(!old || !db.tables.enrollments.some(row => row.packageId === old.id) || (old.mode === input.mode && old.programId === input.programId), 'Mode dan program paket yang sudah digunakan tidak boleh diganti. Buat paket baru.');
    const max = activeProgramSubjects(db, input.programId).length;
    assert(max > 0, 'Tambahkan madah program terlebih dahulu.');
    const minSubjects = input.mode === 'all' ? max : Number(input.minSubjects);
    const maxSubjects = input.mode === 'all' ? max : Number(input.maxSubjects);
    assert(Number.isInteger(minSubjects) && Number.isInteger(maxSubjects) && minSubjects >= 1 && maxSubjects >= minSubjects && maxSubjects <= max, 'Batas pilihan madah tidak valid.');
    return upsertRow(db, 'packages', {id: input.id, programId: input.programId, name: text(input.name, 'Nama paket', 150),
      mode: input.mode, isOpen: !!input.isOpen, minSubjects, maxSubjects});
  }, revision);
}
export function saveProgramSubject(input, revision) {
  return commit(['executive'], db => {
    assert(byId(db.tables.programs, input.programId), 'Program tidak ditemukan.');
    let subject = input.subjectId ? byId(db.tables.subjects, input.subjectId) : null;
    if (!subject) {
      const name = text(input.name, 'Nama madah', 120);
      subject = db.tables.subjects.find(row => row.name.toLowerCase() === name.toLowerCase()) ||
        upsertRow(db, 'subjects', {name, description: text(input.description, 'Deskripsi madah', 500, true)});
    }
    const old = db.tables.programSubjects.find(row => row.programId === input.programId && row.subjectId === subject.id);
    const result = upsertRow(db, 'programSubjects', {id: old?.id, programId: input.programId, subjectId: subject.id, active: input.active !== false});
    const count = activeProgramSubjects(db, input.programId).length;
    assert(count > 0 || !db.tables.packages.some(pack => pack.programId === input.programId), 'Sisakan minimal satu madah pada program yang memiliki paket.');
    db.tables.packages.filter(pack => pack.programId === input.programId).forEach(pack => {
      upsertRow(db, 'packages', {...pack, maxSubjects: count, minSubjects: pack.mode === 'all' ? count : Math.min(pack.minSubjects, count)});
    });
    return result;
  }, revision);
}
export function saveTeacher(input, revision) {
  return commit(['executive'], db => {
    const old = input.id ? byId(db.tables.users, input.id) : null;
    assert(!input.id || old?.role === 'teacher', 'Akun guru tidak ditemukan.');
    const code = text(input.code, 'Kode guru', 30).toUpperCase();
    assert(/^UST-[A-Z0-9-]{2,25}$/.test(code), 'Kode guru menggunakan format UST-01 atau UST-02.');
    assert(['active', 'suspended'].includes(input.status), 'Status guru tidak valid.');
    assert(!old?.title.startsWith(archivePrefix), 'Akun ini telah diarsipkan. Buat akun guru baru.');
    return upsertRow(db, 'users', {
      id: input.id, nia: '', code, name: text(input.name, 'Nama guru', 150), email: email(input.email),
      password: input.password ? password(input.password) : old?.password || password(''),
      phone: input.phone ? phone(input.phone) : '', domicile: text(input.domicile, 'Domisili', 120, true),
      role: 'teacher', status: input.status, title: text(input.title || 'Pengajar', 'Status jabatan', 150)
    });
  }, revision);
}
export function saveAssignment(input, revision) {
  return commit(['executive'], db => {
    const teacher = byId(db.tables.users, input.teacherId);
    assert(teacher?.role === 'teacher' && !teacher.title.startsWith(archivePrefix), 'Guru tidak ditemukan atau sudah diarsipkan.');
    assert(db.tables.programSubjects.some(link => link.programId === input.programId && link.subjectId === input.subjectId), 'Madah tidak terdaftar pada program.');
    const old = db.tables.assignments.find(row => row.teacherId === input.teacherId && row.programId === input.programId && row.subjectId === input.subjectId);
    return upsertRow(db, 'assignments', {id: old?.id, teacherId: input.teacherId, programId: input.programId, subjectId: input.subjectId, active: input.active !== false});
  }, revision);
}
export function saveSchedule(input, revision) {
  return commit(['executive'], db => {
    const assignment = byId(db.tables.assignments, input.assignmentId);
    assert(assignment?.active && canTeach(assignment.teacherId, assignment.programId, assignment.subjectId, db), 'Penugasan harus aktif dan gurunya terverifikasi.');
    const day = Number(input.weekday);
    assert(Number.isInteger(day) && day >= 0 && day <= 4, 'Jadwal aktif hanya Ahad sampai Kamis.');
    const startTime = String(input.startTime || ''), endTime = String(input.endTime || '');
    assert(/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) && /^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) && endTime > startTime, 'Jam mulai dan selesai tidak valid.');
    const room = text(input.room, 'Ruangan', 120), active = input.active !== false;
    if (active) for (const schedule of db.tables.schedules.filter(row => row.id !== input.id && row.active && row.weekday === day)) {
      const other = byId(db.tables.assignments, schedule.assignmentId);
      if (!other?.active || !canTeach(other.teacherId, other.programId, other.subjectId, db)) continue;
      assert(!(schedule.startTime < endTime && startTime < schedule.endTime && (other.teacherId === assignment.teacherId || schedule.room.toLowerCase() === room.toLowerCase())), 'Jadwal bertabrakan dengan jam mengajar guru atau penggunaan ruangan.');
    }
    return upsertRow(db, 'schedules', {id: input.id, assignmentId: assignment.id, weekday: day, startTime, endTime, room, active});
  }, revision);
}
export function removeSchedule(id) {
  return commit(['executive'], db => { db.tables.schedules = db.tables.schedules.filter(row => row.id !== id); });
}
export function removeTeacher(id) {
  return commit(['executive'], db => {
    const teacher = byId(db.tables.users, id);
    assert(teacher?.role === 'teacher', 'Guru tidak ditemukan.');
    const assignmentIds = db.tables.assignments.filter(a => a.teacherId === id).map(a => a.id);
    const historical = db.tables.attendance.some(a => a.teacherId === id) || db.tables.evaluations.some(a => a.teacherId === id) || db.tables.materials.some(a => a.teacherId === id);
    if (historical) {
      upsertRow(db, 'users', {...teacher, status: 'suspended', password: createId('disabled'), title: teacher.title.startsWith(archivePrefix) ? teacher.title : archivePrefix + teacher.title});
      db.tables.assignments.filter(a => a.teacherId === id).forEach(a => upsertRow(db, 'assignments', {...a, active: false}));
      db.tables.schedules.filter(s => assignmentIds.includes(s.assignmentId)).forEach(s => upsertRow(db, 'schedules', {...s, active: false}));
      return 'archived';
    }
    db.tables.schedules = db.tables.schedules.filter(s => !assignmentIds.includes(s.assignmentId));
    db.tables.assignments = db.tables.assignments.filter(a => a.teacherId !== id);
    db.tables.users = db.tables.users.filter(u => u.id !== id);
    return 'deleted';
  });
}
export function updateStudent(input, revision) {
  return commit(['admin', 'executive'], db => {
    const old = byId(db.tables.users, input.id);
    assert(old?.role === 'student', 'Santri tidak ditemukan.');
    const nia = text(input.nia, 'NIA', 6).toUpperCase();
    assert(/^NIA\d{3}$/.test(nia) && nia !== 'NIA000', 'Gunakan NIA001–NIA999.');
    assert(['active', 'suspended'].includes(input.status), 'Status akun tidak valid.');
    db.meta.niaSerial = Math.max(db.meta.niaSerial, Number(nia.slice(3)));
    return upsertRow(db, 'users', {...old, nia, name: text(input.name, 'Nama', 150), email: email(input.email),
      phone: phone(input.phone), domicile: text(input.domicile, 'Domisili', 120), status: input.status,
      password: input.password ? password(input.password) : old.password});
  }, revision);
}
export function removeStudent(id) {
  return commit(['admin', 'executive'], db => {
    assert(byId(db.tables.users, id)?.role === 'student', 'Santri tidak ditemukan.');
    const enrollmentIds = db.tables.enrollments.filter(row => row.studentId === id).map(row => row.id);
    db.tables.enrollmentSubjects = db.tables.enrollmentSubjects.filter(row => !enrollmentIds.includes(row.enrollmentId));
    for (const table of ['enrollments', 'attendance', 'evaluations', 'learning', 'ktaNames', 'ktaRequests']) db.tables[table] = db.tables[table].filter(row => row.studentId !== id);
    db.tables.users = db.tables.users.filter(row => row.id !== id);
  });
}
export function saveMasterName(input, revision) {
  return commit(['executive'], db => {
    assert(byId(db.tables.users, input.studentId)?.role === 'student', 'Akun santri tidak ditemukan.');
    const old = input.id ? byId(db.tables.ktaNames, input.id) : null;
    assert(!old || old.studentId === input.studentId, 'Pemilik nama master tidak boleh diganti.');
    return upsertRow(db, 'ktaNames', {id: input.id, studentId: input.studentId, officialName: text(input.officialName, 'Nama resmi', 150), active: input.active !== false});
  }, revision);
}
export function attendanceAnalytics(db = getDatabase(), today = cairoDate()) {
  return Array.from({length: 7}, (_, index) => {
    const date = addDays(today, index - 6), groups = new Map();
    db.tables.attendance.filter(row => row.date === date && row.countsForStreak && !HOLIDAYS.includes(weekday(date)))
      .forEach(row => groups.set(row.studentId, [...(groups.get(row.studentId) || []), row]));
    const statuses = [...groups.values()].map(dailyAttendance);
    return {date, hadir: statuses.filter(s => s === 'hadir').length, izin: statuses.filter(s => s === 'izin').length, alpha: statuses.filter(s => s === 'alpha').length, total: statuses.length};
  });
}

// Controller antarmuka. Bootstrap dijaga agar fungsi domain dapat diuji di Node.
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
let page = '', root, activeView = null, cinemaGeneration = 0, restoreBusy = false;
const pendingNotes = new Map();
let ui = {materialQuery: '', completion: 'all', subject: '', studentQuery: '', studentStatus: 'all', assignmentId: '', attendanceDate: '', lastDate: ''};
const initials = name => name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
const badge = (value, display = label(value)) => `<span class="badge ${e(value)}">${e(display)}</span>`;
const button = (action, title, value = '', variant = '') => `<button type="button" class="btn btn-sm ${variant}" data-action="${action}" data-id="${e(value)}">${title}</button>`;
const empty = (title, description = '') => `<div class="empty-state">${icon('book')}<h3>${e(title)}</h3>${description ? `<p>${e(description)}</p>` : ''}</div>`;
const brand = subtitle => `<a class="brand" href="index.html"><span class="brand-mark">${BRAND_LOGO_SVG}</span><span class="brand-name">${e(MARKAZ_INFO.name)}<small>${e(subtitle)}</small></span></a>`;
const panelHeading = (title, description = '', action = '') => `<div class="panel-head"><div><h2>${e(title)}</h2>${description ? `<p>${e(description)}</p>` : ''}</div>${action}</div>`;
const stat = (title, value, symbol, hint) => `<article class="stat-card"><div class="stat-top">${e(title)}<span class="stat-symbol">${icon(symbol)}</span></div><strong>${e(value)}</strong><small>${e(hint)}</small></article>`;
function field(name, title, value = '', type = 'text', attributes = '') {
  return `<div class="form-group"><label for="field-${name}">${e(title)}</label><input id="field-${name}" name="${name}" type="${type}" value="${e(value)}" ${attributes}></div>`;
}
function textarea(name, title, value = '', attributes = '') {
  return `<div class="form-group"><label for="field-${name}">${e(title)}</label><textarea id="field-${name}" name="${name}" ${attributes}>${e(value)}</textarea></div>`;
}
function options(rows, selected = '', getLabel = row => row.name) {
  return rows.map(row => `<option value="${e(row.id)}" ${row.id === selected ? 'selected' : ''}>${e(getLabel(row))}</option>`).join('');
}
function select(name, title, content, attributes = '') {
  return `<div class="form-group"><label for="field-${name}">${e(title)}</label><select id="field-${name}" name="${name}" ${attributes}>${content}</select></div>`;
}
const checkbox = (name, title, checked = false) => `<label class="check-label"><input name="${name}" type="checkbox" ${checked ? 'checked' : ''}> ${e(title)}</label>`;
const formEnd = (title = 'Simpan') => `<p class="dialog-error" role="alert" data-form-error></p><div class="form-actions"><button class="btn" type="submit">${e(title)}</button></div></form>`;
function formStart(name, db = getDatabase()) { return `<form data-form="${name}" data-revision="${db.meta.revision}">`; }
const readForm = form => Object.fromEntries(new FormData(form));
function showToast(message, type = 'info') {
  const host = activeView?.dialog.open ? activeView.dialog : document.body;
  let container = $('.toast-container', host);
  if (!container) {
    container = document.createElement('div'); container.className = 'toast-container';
    container.setAttribute('role', 'status'); container.setAttribute('aria-live', 'polite'); host.append(container);
  }
  const toast = document.createElement('div'); toast.className = `toast-item ${type}`; toast.textContent = message;
  container.append(toast); setTimeout(() => { toast.remove(); if (!container.children.length) container.remove(); }, 6000);
}
function openDialog(title, html, wide = false, id = '') {
  activeView?.close();
  const previousFocus = document.activeElement, oldOverflow = document.body.style.overflow;
  const dialog = document.createElement('dialog'); dialog.className = `app-dialog ${wide ? 'wide' : ''}`;
  if (id) dialog.id = id;
  const titleId = createId('dialog-title'); dialog.setAttribute('aria-labelledby', titleId);
  dialog.innerHTML = `<div class="dialog-header"><h2 id="${titleId}">${e(title)}</h2><button type="button" class="btn btn-secondary btn-icon" data-close aria-label="Tutup dialog">${icon('close')}</button></div>${html}`;
  const callbacks = []; let closed = false;
  const view = {dialog, locked: false, onClose: callback => callbacks.push(callback), close: () => {
    if (closed || view.locked) return;
    closed = true;
    callbacks.forEach(callback => { try { callback(); } catch (error) { console.error(error); } });
    dialog.close(); dialog.remove(); document.body.style.overflow = oldOverflow;
    if (activeView === view) activeView = null;
    if (previousFocus?.isConnected) previousFocus.focus({preventScroll: true});
    else $('#dashboard-main h1')?.focus({preventScroll: true});
  }};
  $('[data-close]', dialog).onclick = view.close;
  dialog.addEventListener('cancel', event => { event.preventDefault(); view.close(); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) view.close();
  });
  document.body.append(dialog); document.body.style.overflow = 'hidden'; activeView = view;
  dialog.showModal();
  return view;
}
function ask(title, message, acceptLabel = 'Lanjutkan') {
  return new Promise(resolve => {
    const view = openDialog(title, `<p>${e(message)}</p><div class="dialog-actions"><button class="btn btn-secondary" data-cancel>Batal</button><button class="btn btn-danger" data-accept>${e(acceptLabel)}</button></div>`);
    let accepted = false;
    view.onClose(() => resolve(accepted));
    $('[data-cancel]', view.dialog).onclick = view.close;
    $('[data-accept]', view.dialog).onclick = () => { accepted = true; view.close(); };
    $('[data-cancel]', view.dialog).focus();
  });
}
function bindForm(view, handler) {
  const form = $('form', view.dialog);
  form.onsubmit = async event => {
    event.preventDefault(); if (form.dataset.busy) return;
    const submit = $('[type=submit]', form), errorNode = $('[data-form-error]', form);
    errorNode.textContent = ''; form.dataset.busy = 'true'; submit.disabled = true;
    try { await handler(readForm(form), form, Number(form.dataset.revision)); }
    catch (error) { errorNode.textContent = error.message; errorNode.tabIndex = -1; errorNode.focus(); }
    finally { delete form.dataset.busy; submit.disabled = false; }
  };
  return form;
}
function download(blob, filename) {
  const source = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = source; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(source), 1000);
}
function resourceLinks(material) {
  return [['pdfUrl', 'Unduh Modul', 'file'], ['quizUrl', 'Kerjakan Latihan', 'edit']].map(([key, title, glyph]) => safeUrl(material[key]) ?
    `<a class="btn btn-secondary btn-sm" href="${e(safeUrl(material[key]))}" target="_blank" rel="noopener noreferrer">${icon(glyph)}${title}</a>` : '').join('');
}
function materialCard(material, user, db) {
  const learning = db.tables.learning.find(row => row.studentId === user.id && row.materialId === material.id);
  const subject = byId(db.tables.subjects, material.subjectId), teacher = byId(db.tables.users, material.teacherId);
  const canEdit = isStaff(user) || user.role === 'teacher' && material.teacherId === user.id;
  return `<article class="video-card ${learning?.done ? 'completed' : ''}">
    <button type="button" class="video-thumb" data-action="play" data-id="${e(material.id)}" aria-label="Buka materi ${e(material.title)}"><span class="lesson-label">${learning?.done ? 'SELESAI DITONTON' : e(subject?.name || 'MATERI UMUM')}</span>${icon(material.videoUrl ? 'video' : 'file')}</button>
    <div class="video-info"><div>${badge('blue', byId(db.tables.programs, material.programId)?.name || 'Seluruh Program')} ${!material.published ? badge('pending', 'Draf') : ''}</div>
    <h3>${e(material.title)}</h3><p>${e(material.description)}</p><p class="teacher-label">${e(teacher?.name || 'Tim Markaz')}</p>
    <div class="card-actions">${button('play', material.videoUrl ? 'Putar materi' : 'Buka materi', material.id)}
    ${user.role === 'student' ? `<button class="btn btn-secondary btn-sm" data-action="toggle-done" data-id="${e(material.id)}" aria-pressed="${!!learning?.done}">${learning?.done ? '✓ Selesai' : 'Tandai Selesai'}</button>` : ''}
    ${canEdit ? button('edit-material', 'Edit', material.id, 'btn-secondary') + button('remove-material', 'Hapus', material.id, 'btn-danger') : ''}</div>
    <div class="resources">${resourceLinks(material)}</div></div></article>`;
}
function materialSection(user, db, id = 'materi') {
  const visible = db.tables.materials.filter(m => canViewMaterial(user, m, db));
  const subjects = db.tables.subjects.filter(s => visible.some(m => m.subjectId === s.id));
  return `<section id="${id}">${panelHeading('Pustaka pembelajaran', user.role === 'student' ? 'Materi sesuai program dan madah yang kamu ambil.' : 'Kelola video, modul dan latihan per madah.', user.role !== 'student' ? button('add-material', `${icon('plus')}Tambah materi`) : '')}
    <div class="material-toolbar"><div class="video-filter" role="group" aria-label="Filter penyelesaian">${user.role === 'student' ? [['all', 'Semua Materi'], ['unwatched', 'Belum Ditonton'], ['done', 'Selesai Ditonton']].map(([value, title]) => `<button class="filter-chip ${ui.completion === value ? 'active' : ''}" data-action="completion-filter" data-id="${value}" aria-pressed="${ui.completion === value}">${title}</button>`).join('') : ''}</div>
    <label class="search-label" for="material-search">Cari judul<input type="search" id="material-search" value="${e(ui.materialQuery)}" placeholder="Cari materi…"></label>
    <label class="search-label" for="material-subject">Madah<select id="material-subject"><option value="">Semua Madah</option>${options(subjects, ui.subject)}</select></label></div>
    <p class="file-note" id="material-result-count" role="status"></p><div class="video-grid" id="material-grid"></div></section>`;
}
function renderMaterials() {
  if (!$('#material-grid')) return;
  const db = getDatabase(), user = currentUser(db); if (!user) return;
  const visible = db.tables.materials.filter(m => canViewMaterial(user, m, db))
    .filter(m => !ui.subject || m.subjectId === ui.subject)
    .filter(m => m.title.toLowerCase().includes(ui.materialQuery.trim().toLowerCase()))
    .filter(m => {
      if (user.role !== 'student' || ui.completion === 'all') return true;
      const done = !!db.tables.learning.find(r => r.studentId === user.id && r.materialId === m.id)?.done;
      return done === (ui.completion === 'done');
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  $('#material-grid').innerHTML = visible.length ? visible.map(m => materialCard(m, user, db)).join('') : empty('Belum ada materi yang cocok', 'Coba pencarian lain atau periksa status langgananmu.');
  $('#material-result-count').textContent = `${visible.length} materi ditampilkan`;
}
function announcementsSection(db, editable = false) {
  const items = db.tables.announcements.filter(row => editable || row.published).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return `<section id="kabar" class="panel">${panelHeading('Kabar Markaz', 'Informasi akademik dan kegiatan terbaru.', editable ? button('add-announcement', 'Terbitkan pengumuman') : '')}<div class="announcement-list">${items.length ? items.map(item => `<article class="announcement-row"><div><small>${e(item.category)} · ${e(formatDate(item.createdAt))}${!item.published ? ' · Draf' : ''}</small><h3>${e(item.title)}</h3><p>${e(item.body)}</p></div>${editable ? `<div class="card-actions">${button('edit-announcement', 'Edit', item.id, 'btn-secondary')}${button('remove-announcement', 'Hapus', item.id, 'btn-danger')}</div>` : ''}</article>`).join('') : empty('Belum ada pengumuman')}</div></section>`;
}
function schedulesSection(user, db) {
  let schedules = db.tables.schedules.filter(s => s.active && !HOLIDAYS.includes(s.weekday));
  if (user.role === 'student') schedules = schedules.filter(s => {
    const a = byId(db.tables.assignments, s.assignmentId);
    return a?.active && canTeach(a.teacherId, a.programId, a.subjectId, db) && getActiveEnrollments(user.id, db).some(enrollment => enrollment.programId === a.programId && enrolledSubject(db, enrollment, a.subjectId));
  });
  else if (user.role === 'teacher') schedules = schedules.filter(s => {
    const a = byId(db.tables.assignments, s.assignmentId); return a?.teacherId === user.id && a.active;
  });
  const cards = schedules.sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime)).map(s => {
    const a = byId(db.tables.assignments, s.assignmentId);
    return `<article class="schedule-card"><div class="schedule-time"><strong>${DAYS[s.weekday]}</strong><span>${e(s.startTime)}</span><small>s.d. ${e(s.endTime)} · Kairo</small></div><div>${badge('blue', byId(db.tables.programs, a.programId)?.name)}<h3>${e(byId(db.tables.subjects, a.subjectId)?.name)}</h3><p>${e(byId(db.tables.users, a.teacherId)?.name)}<br>Ruangan: ${e(s.room)}</p>${user.role === 'executive' ? `<div class="card-actions">${button('edit-schedule', 'Edit', s.id, 'btn-secondary')}${button('remove-schedule', 'Hapus', s.id, 'btn-danger')}</div>` : ''}</div></article>`;
  });
  return `<section id="jadwal" class="panel">${panelHeading('Jadwal Halaqah', 'Jam lokal Kairo · Ahad–Kamis. Jumat dan Sabtu libur resmi.', user.role === 'executive' ? button('add-schedule', 'Tambah jadwal') : '')}<div class="schedule-grid">${cards.length ? cards.join('') : empty('Jadwal belum tersedia')}</div></section>`;
}
function streakMarkup(user, db) {
  const streak = streakFor(user.id, db);
  const style = streak.state === 'freeze' || streak.state === 'izin' ? 'freeze' : streak.count === 0 || streak.state === 'alpha' ? 'off' : '';
  return `<article class="streak-card ${style}"><div class="streak-top"><div class="streak-flame">${icon(streak.state === 'freeze' ? 'snow' : 'flame')}</div><div><div class="streak-count">${streak.count}</div><strong>Hari Istiqomah</strong><div class="streak-caption">Setiap hadir adalah langkah baik.</div></div></div><div class="streak-status">${e(streak.message)}</div><div class="week-strip">${streak.week.map(day => `<div class="week-day ${day.status}" title="${e(formatDate(day.date))} · ${e(label(day.status))}"><span>${day.day.slice(0, 3)}</span>${icon(day.status === 'hadir' ? 'flame' : day.status === 'freeze' ? 'snow' : day.status === 'alpha' ? 'close' : 'clock')}</div>`).join('')}</div></article>`;
}
function leaderboardMarkup(user, db) {
  const leaders = streakLeaderboard(db);
  return `<article class="panel">${panelHeading('Papan Istiqomahan', 'Top 5 streak santri')}<ol class="leaderboard">${leaders.length ? leaders.map((row, index) => `<li class="${row.id === user.id ? 'me' : ''}"><span class="rank">${index + 1}</span><span class="leader-name">${e(row.name)}${row.id === user.id ? ' · Kamu' : ''}</span><span class="leader-score">${icon('flame')} ${row.count}</span></li>`).join('') : '<li>Belum ada catatan istiqomah.</li>'}</ol></article>`;
}
function ktaPanel(user, db) {
  const request = db.tables.ktaRequests.find(row => row.studentId === user.id);
  const missing = !request || request.status === 'missing';
  return `<section id="kta" class="kta-panel">${panelHeading('Kartu Tanda At-Ta’allum', 'Kartu identitas santri untuk keperluan absensi.')}${badge(request?.status || 'missing')}
    <p class="muted" style="margin-top:12px">${missing ? 'Lengkapi status kartu absensimu atau ajukan pembuatan KTA.' : request.source === 'self' ? 'Kepemilikan KTA telah kamu konfirmasi.' : 'Pengajuan tersimpan. Untuk pembuatan kartu, lanjutkan percakapan WhatsApp dan lampirkan foto diri.'}</p>
    <div class="card-actions">${missing ? button('claim-kta', 'Sudah Punya KTA', '', 'btn-secondary') + button('create-kta', 'Belum Punya KTA (Buat Sekarang)', '', 'btn-orange') : request.status === 'requested' ? button('create-kta', 'Lihat / Lengkapi Pengajuan', '', 'btn-secondary') : ''}
    ${request?.nameId && request.source === 'request' ? `<a class="btn btn-orange btn-sm" href="${e(ktaWhatsappLink(request, db))}" target="_blank" rel="noopener noreferrer">Lanjutkan ke WhatsApp</a>` : ''}</div></section>`;
}
function subscriptions(user, db) {
  const items = db.tables.enrollments.filter(enrollment => enrollment.studentId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return `<section id="langganan" class="panel">${panelHeading('Program belajarmu', 'Pilih program dan madah yang sesuai kebutuhan.', button('enroll', 'Daftar Program Belajar', '', 'btn-orange'))}
    ${items.length ? items.map(item => {
      const pack = byId(db.tables.packages, item.packageId);
      const subjectNames = db.tables.enrollmentSubjects.filter(link => link.enrollmentId === item.id).map(link => byId(db.tables.subjects, link.subjectId)?.name).join(', ');
      const effective = item.status === 'active' && !enrollmentValid(item, cairoDate()) ? item.startDate > cairoDate() ? 'pending' : 'expired' : item.status;
      return `<article class="subscription-card ${effective}"><div class="panel-head"><h3>${e(byId(db.tables.programs, item.programId)?.name)}</h3>${badge(effective)}</div><p>${e(pack?.name)}</p><p class="muted">${e(subjectNames)}</p>${item.reviewNote ? `<p class="file-note">Catatan admin: ${e(item.reviewNote)}</p>` : ''}${item.startDate ? `<small>Mulai ${e(formatDate(item.startDate))}${item.endDate ? ` · Berakhir ${e(formatDate(item.endDate))}` : ''}</small>` : ''}</article>`;
    }).join('') : empty('Belum berlangganan program', 'Akunmu sudah aktif. Daftarkan program dan paket untuk membuka materi belajar.')}</section>`;
}
function studentContent(user, db) {
  const evaluations = db.tables.evaluations.filter(row => row.studentId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return `${sheetsSections(user)}
    <aside class="sheets-local-note"><strong>Fitur belajar di perangkat ini</strong><p>Materi, KTA, mutaba’ah, dan kabar di bawah masih memakai data aplikasi pada perangkat ini. Spreadsheet absensi belum menyediakan data fitur tersebut.</p></aside>
    ${materialSection(user, db)}${ktaPanel(user, db)}
    <section id="evaluasi" class="panel">${panelHeading('Mutaba’ah dari guru', 'Catatan aplikasi lokal; belum tersambung spreadsheet.')}<div class="evaluation-list">${evaluations.length ? evaluations.map(item => `<article class="evaluation-card"><small>${e(byId(db.tables.users, item.teacherId)?.name)} · ${e(byId(db.tables.subjects, item.subjectId)?.name)} · ${e(formatDate(item.createdAt))}</small><p>${e(item.body)}</p></article>`).join('') : empty('Belum ada catatan perkembangan')}</div></section>${announcementsSection(db)}`;
}

function teacherContent(user, db) {
  const assignments = db.tables.assignments.filter(a => a.teacherId === user.id && a.active);
  if (!assignments.some(a => a.id === ui.assignmentId)) ui.assignmentId = assignments[0]?.id || '';
  const selected = byId(assignments, ui.assignmentId);
  const date = ui.attendanceDate || cairoDate();
  const roster = selected ? teachingRoster(user.id, selected.programId, selected.subjectId, date, db) : [];
  const days = db.tables.schedules.filter(s => s.active && assignments.some(a => a.id === s.assignmentId)).map(s => s.weekday);
  return `<section id="overview"><div class="stats-grid">${stat('Kode guru', user.code, 'id', user.title)}${stat('Madah ditugaskan', assignments.length, 'book', 'Penugasan guru aktif')}${stat('Hari mengajar', [...new Set(days)].length, 'calendar', 'Jadwal lokal Kairo')}${stat('Materi unggahan', db.tables.materials.filter(m => m.teacherId === user.id).length, 'video', 'Rekaman dan bahan ajar')}</div>
    <article class="panel">${panelHeading('Profil penugasan', user.name)}<div class="assignment-tags">${assignments.length ? assignments.map(a => badge('blue', `${byId(db.tables.programs, a.programId)?.name} · ${byId(db.tables.subjects, a.subjectId)?.name}`)).join('') : '<p class="muted">Belum ada penugasan. Hubungi eksekutif Markaz.</p>'}</div></article></section>
    <section id="absensi" class="panel">${panelHeading('Absensi kelas', 'Satu tanggal Kairo dihitung maksimal sekali untuk streak. Alpha memiliki prioritas bila ada status berbeda pada hari yang sama.')}
      <div class="toolbar">${select('attendanceAssignment', 'Program / Madah', options(assignments, ui.assignmentId, a => `${byId(db.tables.programs, a.programId)?.name} · ${byId(db.tables.subjects, a.subjectId)?.name}`))}
      ${field('attendanceDate', 'Tanggal Kairo', date, 'date', `max="${cairoDate()}"`)}</div>
      <div id="attendance-notice">${HOLIDAYS.includes(weekday(date)) ? '<div class="notice-banner orange"><p>Hari libur resmi. Streak dibekukan dan absensi tidak dapat diisi.</p></div>' : ''}</div>
      <div class="table-wrap"><table><caption>Santri yang mengambil madah ini pada tanggal pilihan</caption><thead><tr><th>Santri</th><th>NIA</th><th>Status</th><th>Tandai kehadiran</th><th>Evaluasi</th></tr></thead><tbody>${roster.length ? roster.map(({student, enrollment}) => {
        const attendance = db.tables.attendance.find(a => a.enrollmentId === enrollment.id && a.subjectId === selected.subjectId && a.date === date);
        const enabled = !HOLIDAYS.includes(weekday(date)) && date <= cairoDate() && db.tables.schedules.some(s => s.assignmentId === selected.id && s.active && s.weekday === weekday(date));
        return `<tr><td>${e(student.name)}</td><td>${e(student.nia)}</td><td>${attendance ? badge(attendance.status) : badge('pending', 'Belum diisi')}</td><td><div class="attendance-actions">${['hadir', 'izin', 'alpha'].map(status => `<button class="btn btn-secondary btn-sm ${attendance?.status === status ? 'selected' : ''}" data-action="attendance" data-id="${e(enrollment.id)}" data-status="${status}" ${!enabled ? 'disabled' : ''} aria-pressed="${attendance?.status === status}">${label(status)}</button>`).join('')}</div></td><td>${button('add-evaluation', 'Tulis mutaba’ah', student.id, 'btn-secondary')}</td></tr>`;
      }).join('') : '<tr><td colspan="5">Belum ada santri aktif pada pilihan ini.</td></tr>'}</tbody></table></div></section>
    ${materialSection(user, db)}${schedulesSection(user, db)}${announcementsSection(db)}`;
}
function studentManagement(user, db) {
  const students = db.tables.users.filter(s => s.role === 'student')
    .filter(s => ui.studentStatus === 'all' || s.status === ui.studentStatus)
    .filter(s => `${s.name} ${s.nia} ${s.email}`.toLowerCase().includes(ui.studentQuery.trim().toLowerCase()));
  return `<section id="santri" class="panel">${panelHeading('Data santri dan KTA', 'Akun dasar aktif terpisah dari status langganan program.', button('export-csv', `${icon('download')}Ekspor CSV`, '', 'btn-secondary'))}<div class="toolbar"><label for="student-search">Cari santri<input id="student-search" type="search" value="${e(ui.studentQuery)}" placeholder="Nama, NIA atau email"></label><label for="student-status">Status akun<select id="student-status"><option value="all">Semua</option><option value="active" ${ui.studentStatus === 'active' ? 'selected' : ''}>Aktif</option><option value="suspended" ${ui.studentStatus === 'suspended' ? 'selected' : ''}>Nonaktif</option></select></label></div><div class="table-wrap"><table><thead><tr><th>Santri</th><th>NIA</th><th>Kontak</th><th>Akun</th><th>KTA</th><th>Aksi</th></tr></thead><tbody>${students.length ? students.map(student => {
    const kta = db.tables.ktaRequests.find(k => k.studentId === student.id);
    return `<tr><td><strong>${e(student.name)}</strong><br><small>${e(student.domicile)}</small></td><td>${e(student.nia)}</td><td>${e(student.email)}<br><small>${e(student.phone)}</small></td><td>${badge(student.status)}</td><td>${badge(kta?.status || 'missing')}</td><td><div class="table-actions">${button('edit-student', 'Edit akun', student.id, 'btn-secondary')}${button('manage-kta', 'Kelola KTA', student.id, 'btn-secondary')}${user.role === 'executive' ? button('master-name', 'Nama resmi KTA', student.id, 'btn-secondary') : ''}</div></td></tr>`;
  }).join('') : '<tr><td colspan="6">Tidak ada santri yang cocok.</td></tr>'}</tbody></table></div></section>`;
}
function verificationSection(db) {
  const requests = db.tables.enrollments.filter(row => row.status === 'pending').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return `<section id="verifikasi" class="panel">${panelHeading('Verifikasi langganan dan pembayaran', 'Periksa pembayaran secara mandiri, lalu setujui atau tolak pengajuan.')}<div class="table-wrap"><table><thead><tr><th>Santri</th><th>Program / Paket</th><th>Madah</th><th>Pengajuan</th><th>Keputusan</th></tr></thead><tbody>${requests.length ? requests.map(item => `<tr><td>${e(byId(db.tables.users, item.studentId)?.name)}<br><small>${e(byId(db.tables.users, item.studentId)?.nia)}</small></td><td>${e(byId(db.tables.programs, item.programId)?.name)}<br><small>${e(byId(db.tables.packages, item.packageId)?.name)}</small></td><td>${e(db.tables.enrollmentSubjects.filter(s => s.enrollmentId === item.id).map(s => byId(db.tables.subjects, s.subjectId)?.name).join(', '))}</td><td>${e(formatDate(item.requestedAt))}</td><td><div class="table-actions">${button('approve-enrollment', 'Setujui', item.id)}${button('reject-enrollment', 'Tolak', item.id, 'btn-danger')}</div></td></tr>`).join('') : '<tr><td colspan="5">Tidak ada pengajuan yang menunggu verifikasi.</td></tr>'}</tbody></table></div></section>`;
}
function programManagement(db) {
  return `<section id="program" class="panel">${panelHeading('Kendali program dan paket', 'Menutup pendaftaran tidak mencabut akses langganan yang sudah aktif.', button('add-program', 'Tambah program'))}
    ${db.tables.programs.map(program => `<article class="program-control"><div><h3>${e(program.name)}</h3><p>${e(program.description)}</p><div class="card-actions">${badge(program.isOpen ? 'active' : 'suspended', program.isOpen ? 'Pendaftaran dibuka' : 'Pendaftaran ditutup')}${button('edit-program', 'Edit program', program.id, 'btn-secondary')}${button('manage-packages', 'Paket', program.id, 'btn-secondary')}${button('manage-subjects', 'Madah', program.id, 'btn-secondary')}</div></div><label class="switch"><input type="checkbox" data-program-toggle="${e(program.id)}" ${program.isOpen ? 'checked' : ''} aria-label="Buka pendaftaran ${e(program.name)}"><span class="switch-track"></span></label></article>`).join('')}</section>`;
}
function teacherManagement(db) {
  const teachers = db.tables.users.filter(user => user.role === 'teacher');
  return `<section id="guru" class="panel">${panelHeading('Akun dan penugasan guru', 'Atur kode, jabatan, program, madah dan jadwal mengajar.', button('add-teacher', 'Tambah guru'))}<div class="table-wrap"><table><thead><tr><th>Guru / Kode</th><th>Jabatan</th><th>Penugasan aktif</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${teachers.map(teacher => `<tr><td><strong>${e(teacher.name)}</strong><br>${e(teacher.code)}<br><small>${e(teacher.email)}</small></td><td>${e(teacher.title)}</td><td>${e(db.tables.assignments.filter(a => a.teacherId === teacher.id && a.active).map(a => `${byId(db.tables.programs, a.programId)?.name}: ${byId(db.tables.subjects, a.subjectId)?.name}`).join('; ') || 'Belum ada')}</td><td>${badge(teacher.status)}</td><td><div class="table-actions">${!teacher.title.startsWith(archivePrefix) ? button('edit-teacher', 'Edit akun', teacher.id, 'btn-secondary') + button('manage-assignment', 'Penugasan', teacher.id, 'btn-secondary') + button('remove-teacher', 'Hapus', teacher.id, 'btn-danger') : 'Akun diarsipkan'}</div></td></tr>`).join('')}</tbody></table></div></section>`;
}
function analyticsSection(db) {
  const days = attendanceAnalytics(db);
  const programRows = db.tables.programs.map(program => ({...program, total: new Set(getAllActiveEnrollments(db).filter(enrollment => enrollment.programId === program.id).map(enrollment => enrollment.studentId)).size}));
  const max = Math.max(1, ...programRows.map(p => p.total));
  return `<section id="analitik" class="panel">${panelHeading('Monitoring seluruh Markaz', 'Grafik absensi menghitung santri per tanggal Kairo; data yang belum diisi tidak dianggap Alpha.')}<div class="panel-grid"><article><h3>Santri aktif per program</h3><div class="chart-bars">${programRows.map(program => `<div class="chart-row"><span>${e(program.name)}</span><div class="chart-track"><div class="chart-fill" style="width:${Math.round(program.total / max * 100)}%"></div></div><strong>${program.total}</strong></div>`).join('')}</div></article><article><h3>Keaktifan absen · 7 hari</h3><div class="chart-bars">${days.map(day => `<div class="chart-row"><span>${e(formatDate(day.date, {day: 'numeric', month: 'short', year: undefined}))}</span><progress max="${Math.max(1, day.total)}" value="${day.hadir}" aria-label="Hadir ${e(day.date)}: ${day.hadir} dari ${day.total} catatan"></progress><strong>${day.hadir}/${day.total}</strong></div>`).join('')}</div><p class="file-note">${days.reduce((sum, d) => sum + d.hadir, 0)} Hadir · ${days.reduce((sum, d) => sum + d.izin, 0)} Izin · ${days.reduce((sum, d) => sum + d.alpha, 0)} Alpha</p></article></div></section>`;
}
function getAllActiveEnrollments(db) { return db.tables.enrollments.filter(item => enrollmentValid(item, cairoDate())); }
function staffContent(user, db) {
  const students = db.tables.users.filter(s => s.role === 'student');
  const stats = `<section id="overview"><div class="stats-grid">${stat('Total santri', students.length, 'users', 'Akun dasar terdaftar')}${stat('Menunggu pembayaran', db.tables.enrollments.filter(s => s.status === 'pending').length, 'clock', 'Pengajuan perlu diverifikasi')}${stat('Langganan aktif', getAllActiveEnrollments(db).length, 'check', 'Program dan paket terverifikasi')}${stat('Materi tersimpan', db.tables.materials.length, 'video', 'Video, modul dan kuis')}</div></section>`;
  const backup = user.role === 'executive' ? `<section id="cadangan" class="panel">${panelHeading('Backup dan restore database', 'Simpan salinan sebelum berpindah perangkat atau mengganti data.')}<div class="backup-tools"><label class="backup-option"><input id="backup-media" type="checkbox" checked> Sertakan file video lokal</label><div class="card-actions">${button('backup', 'Backup Data (.json)', '', 'btn-secondary')}${button('restore', 'Restore / Import (.json)')}${button('export-csv', 'Ekspor CSV', '', 'btn-secondary')}</div><input id="restore-file" type="file" accept=".json,application/json" hidden><p class="file-note">Backup memuat akun dan catatan lokal. Simpan salinannya secara pribadi.</p></div></section>` : '';
  return stats + (user.role === 'executive' ? analyticsSection(db) + programManagement(db) + teacherManagement(db) : '') + verificationSection(db) + studentManagement(user, db) + materialSection(user, db) + announcementsSection(db, true) + schedulesSection(user, db) + backup;
}
const NAV = {
  student: [['overview','home','Ringkasan'],['langganan','book','Program'],['materi','video','Materi'],['kta','id','KTA'],['jadwal','calendar','Jadwal'],['riwayat','check','Kehadiran'],['evaluasi','edit','Mutaba’ah'],['kabar','bell','Kabar']],
  teacher: [['overview','home','Ringkasan'],['absensi','check','Absensi'],['materi','video','Materi'],['jadwal','calendar','Jadwal'],['kabar','bell','Kabar']],
  admin: [['overview','home','Ringkasan'],['verifikasi','check','Verifikasi'],['santri','users','Santri & KTA'],['materi','video','Materi'],['kabar','bell','Kabar'],['jadwal','calendar','Jadwal']],
  executive: [['overview','home','Ringkasan'],['analitik','chart','Analitik'],['program','book','Program'],['guru','users','Guru'],['verifikasi','check','Verifikasi'],['santri','id','Santri & KTA'],['materi','video','Materi'],['kabar','bell','Kabar'],['jadwal','calendar','Jadwal'],['cadangan','download','Backup']]
};
function renderDashboard() {
  const db = getDatabase(), user = currentUser(db);
  if (!user) { clearSession(); location.replace('login.html'); return; }
  if (page !== user.role) { location.replace(ROLES[user.role].page); return; }
  const nav = NAV[user.role];
  const links = nav.map(([id, glyph, title]) => `<a href="#${id}"><span class="nav-icon">${icon(glyph)}</span>${e(title)}</a>`).join('');
  const mobileItems = nav.length <= 4 ? nav : nav.filter(([id]) => user.role === 'student' ? ['overview', 'langganan', 'materi', 'kta'].includes(id) : user.role === 'executive' ? ['overview', 'program', 'guru', 'verifikasi'].includes(id) : user.role === 'teacher' ? ['overview', 'absensi', 'materi', 'jadwal'].includes(id) : ['overview', 'verifikasi', 'santri', 'materi'].includes(id));
  root.innerHTML = `<aside class="sidebar">${brand(ROLES[user.role].label)}<div><span class="side-label">Ruang ${e(ROLES[user.role].label)}</span><nav class="side-nav" aria-label="Menu utama">${links}</nav></div><div class="sidebar-bottom">${button('logout', `${icon('logout')}Keluar`, '', 'btn-secondary')}<div class="profile-mini"><span class="avatar">${e(initials(user.name))}</span><div><strong>${e(user.name)}</strong><small>${e(user.nia || user.code)}</small></div></div></div></aside>
    <header class="mobile-header">${brand(ROLES[user.role].label)}<span class="avatar">${e(initials(user.name))}</span></header>
    <main class="dash-main" id="dashboard-main"><div class="dash-top"><div class="welcome"><span class="page-kicker">${e(ROLES[user.role].label)} · ${e(formatDate(cairoDate()))}</span><h1 tabindex="-1">Assalamu’alaikum, ${e(user.name.split(/\s+/)[0])}</h1><p>${user.role === 'student' ? 'Ilmu yang bermanfaat tumbuh bersama adab dan istiqomah.' : 'Kelola perjalanan belajar keluarga Markaz.'}</p></div>${user.role === 'student' ? `<a class="btn btn-secondary btn-sm" href="#riwayat">${icon('check')}Kehadiran saya</a>` : `<div class="top-profile"><span class="avatar">${e(initials(user.name))}</span><strong>${e(user.name)}</strong></div>`}</div>
    ${user.role === 'student' ? studentContent(user, db) : user.role === 'teacher' ? teacherContent(user, db) : staffContent(user, db)}
    </main><nav class="mobile-nav" aria-label="Navigasi dashboard">${mobileItems.map(([id, glyph, title]) => `<a href="#${id}"><span class="nav-icon">${icon(glyph)}</span>${e(title)}</a>`).join('')}${nav.length > 4 ? `<button type="button" data-action="more-nav"><span class="nav-icon">${icon('plus')}</span>Lainnya</button>` : ''}${nav.length <= 4 ? `<button data-action="logout"><span class="nav-icon">${icon('logout')}</span>Keluar</button>` : ''}</nav>`;
  renderMaterials(); wirePageInputs(); updateScrollSpy(); ui.lastDate = cairoDate();
  if (user.role === 'student') mountSheets(user);
}
function wirePageInputs() {
  $('#material-search')?.addEventListener('input', event => { ui.materialQuery = event.target.value; renderMaterials(); });
  $('#material-subject')?.addEventListener('change', event => { ui.subject = event.target.value; renderMaterials(); });
  $('#student-search')?.addEventListener('input', event => {
    ui.studentQuery = event.target.value;
    // Filter table only; keep focus and cursor in the search field.
    const user = currentUser(), db = getDatabase(), scratch = document.createElement('div'); scratch.innerHTML = studentManagement(user, db);
    $('#santri tbody').innerHTML = $('tbody', scratch).innerHTML;
  });
  $('#student-status')?.addEventListener('change', event => { ui.studentStatus = event.target.value; renderDashboard(); });
  $('#field-attendanceAssignment')?.addEventListener('change', event => { ui.assignmentId = event.target.value; refreshAttendanceTable(); });
  $('#field-attendanceDate')?.addEventListener('input', event => { if (!isDateKey(event.target.value)) return; ui.attendanceDate = event.target.value; refreshAttendanceTable(); });
  $('#field-attendanceDate')?.addEventListener('change', event => { if (!isDateKey(event.target.value) || ui.attendanceDate === event.target.value) return; ui.attendanceDate = event.target.value; refreshAttendanceTable(); });
  $('#restore-file')?.addEventListener('change', event => { const file = event.target.files[0]; event.target.value = ''; if (file) runRestore(file); });
}
function refreshAttendanceTable() {
  const db = getDatabase(), user = currentUser(db); if (user?.role !== 'teacher' || !$('#absensi')) return;
  const scratch = document.createElement('div'); scratch.innerHTML = teacherContent(user, db);
  $('#absensi tbody').innerHTML = $('#absensi tbody', scratch).innerHTML;
  $('#attendance-notice').innerHTML = $('#attendance-notice', scratch).innerHTML;
}
function updateScrollSpy() {
  if (!root || !NAV[page]) return;
  const links = $$('.sidebar a[href^="#"], .mobile-nav a[href^="#"]');
  const sections = NAV[page].map(([id]) => document.getElementById(id)).filter(Boolean);
  let selected = sections[0];
  for (const section of sections) if (section.getBoundingClientRect().top <= 125) selected = section;
  if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 8) selected = sections.at(-1);
  links.forEach(link => {
    const active = link.hash === `#${selected?.id}`; link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
  });
}

function openEnrollment() {
  requireRole('student'); const db = getDatabase(), programs = db.tables.programs.filter(p => p.isOpen);
  if (!programs.length) return openDialog('Pendaftaran program', empty('Belum ada program yang dibuka', 'Hubungi admin untuk informasi pendaftaran berikutnya.'));
  const view = openDialog('Daftar Program Belajar', formStart('enrollment', db) +
    select('programId', 'Program yang sedang dibuka', options(programs)) + '<div data-package-fields></div>' +
    '<div class="notice-banner orange"><p>Pengajuan akan berstatus menunggu verifikasi pembayaran. Materi terbuka setelah admin menyetujuinya.</p></div>' + formEnd('Kirim pengajuan'), true);
  const form = bindForm(view, (data, form, revision) => {
    submitEnrollment({...data, subjectIds: new FormData(form).getAll('subjectIds')}, revision);
    view.close(); renderDashboard(); showToast('Pengajuan tersimpan. Menunggu verifikasi pembayaran admin.', 'success');
  });
  const renderSubjects = () => {
    const programId = form.elements.programId.value, packageId = form.elements.packageId?.value;
    const pack = byId(db.tables.packages, packageId);
    const subjectIds = activeProgramSubjects(db, programId);
    const host = $('[data-subject-fields]', form);
    if (!pack) { host.innerHTML = empty('Paket belum tersedia'); return; }
    host.innerHTML = `<p class="file-note">${pack.mode === 'all' ? 'Mutqin mengambil seluruh madah dan wajib hadir Ahad–Kamis.' : `Pilih ${pack.minSubjects}–${pack.maxSubjects} madah. Jadwal hadir mengikuti madah yang dipilih.`}</p><div class="subject-picker">${subjectIds.map(id => `<label class="subject-option"><input type="checkbox" name="subjectIds" value="${e(id)}" ${pack.mode === 'all' ? 'checked disabled' : ''}>${e(byId(db.tables.subjects, id)?.name)}</label>`).join('')}</div>`;
  };
  const renderPackages = () => {
    const packages = db.tables.packages.filter(pack => pack.programId === form.elements.programId.value && pack.isOpen);
    $('[data-package-fields]', form).innerHTML = select('packageId', 'Paket belajar', packages.length ? options(packages) : '<option value="">Belum ada paket terbuka</option>') + '<div data-subject-fields></div>';
    form.elements.packageId.onchange = renderSubjects; renderSubjects();
  };
  form.elements.programId.onchange = renderPackages; renderPackages();
}
function openKtaForm() {
  const db = getDatabase(), user = requireRole('student');
  const names = db.tables.ktaNames.filter(n => n.studentId === user.id && n.active);
  if (!names.length) return openDialog('Nama resmi belum tersedia', '<p>Hubungi admin/eksekutif agar namamu dicocokkan dengan master daftar santri. Nama KTA tidak diisi manual.</p>');
  const old = db.tables.ktaRequests.find(row => row.studentId === user.id);
  const view = openDialog('Pembuatan KTA Markaz', formStart('kta', db) +
    field('nameSearch', 'Cari nama resmi', '', 'search', 'autocomplete="off" placeholder="Cari pada master nama…"') +
    select('nameId', 'Nama lengkap dari master santri', options(names, old?.nameId, item => item.officialName), 'required') +
    field('gmail', 'Alamat Gmail', old?.gmail || (/@gmail\.com$/i.test(user.email) ? user.email : ''), 'email', 'required autocomplete="email"') +
    field('phone', 'Nomor HP / WhatsApp', old?.phone || user.phone, 'tel', 'required autocomplete="tel"') +
    field('domicile', 'Domisili Kairo', old?.domicile || user.domicile, 'text', 'required list="domicile-options" maxlength="120"') +
    `<datalist id="domicile-options">${DOMICILES.map(name => `<option value="${e(name)}"></option>`).join('')}</datalist><div data-kta-preview aria-live="polite"></div><p class="kta-preview-label">Pratinjau data kartu · Kartu dicetak oleh pengelola</p><p class="kta-warning">Lampirkan foto diri setelah WhatsApp terbuka agar KTA dapat diproses.</p>` + formEnd('Generate & Kirim ke WhatsApp'), true);
  const form = bindForm(view, (data, form, revision) => {
    const request = submitKta(data, revision);
    const link = ktaWhatsappLink(request);
    // Hanya membuka draf WhatsApp; pengiriman pesan dilakukan pengguna.
    window.open(link, '_blank', 'noopener,noreferrer');
    try { mutateDatabase(db => upsertRow(db, 'ktaRequests', {...request, whatsappOpenedAt: now()})); } catch { /* Pengajuan utama sudah tersimpan; penanda pembukaan WA opsional. */ }
    view.close(); renderDashboard();
    openDialog('Pengajuan KTA tersimpan', `<p>Lanjutkan di WhatsApp, kirim pesannya, lalu lampirkan foto diri.</p><p class="kta-warning">⚠️ JANGAN LUPA LAMPIRKAN FOTO DIRI ANDA PADA CHAT INI UNTUK PEMBUATAN KTA MARKAZ AT-TA'ALLUM!</p><a class="btn btn-orange" href="${e(link)}" target="_blank" rel="noopener noreferrer">Buka WhatsApp</a>`);
  });
  const preview = () => {
    const name = byId(names, form.elements.nameId.value);
    $('[data-kta-preview]', form).innerHTML = `<article class="kta-preview">${brand('Kartu Tanda At-Ta’allum')}<h3>${e(name?.officialName || 'Pilih nama resmi')}</h3><div class="kta-nia">${e(user.nia)}</div><div class="kta-details">${e(form.elements.gmail.value || 'Alamat Gmail')}<br>${e(form.elements.phone.value || 'Nomor WhatsApp')}<br>${e(form.elements.domicile.value || 'Domisili Kairo')}</div><small class="kta-foot">ILMU · ADAB · ISTIQOMAH</small></article>`;
  };
  form.addEventListener('input', event => {
    if (event.target.name === 'nameSearch') {
      const query = event.target.value.toLowerCase(), selected = form.elements.nameId.value;
      const matches = names.filter(name => name.officialName.toLowerCase().includes(query));
      form.elements.nameId.innerHTML = matches.length ? options(matches, selected, name => name.officialName) : '<option value="">Nama tidak ditemukan</option>';
    }
    preview();
  });
  form.addEventListener('change', preview); preview();
}
async function openCinema(materialId) {
  const db = getDatabase(), user = currentUser(db), material = byId(db.tables.materials, materialId);
  assert(canViewMaterial(user, material, db), 'Kamu tidak memiliki akses ke materi ini.');
  const generation = ++cinemaGeneration;
  const student = user.role === 'student';
  const learning = db.tables.learning.find(row => row.studentId === user.id && row.materialId === materialId);
  const view = openDialog(material.title, `<div class="cinema-stage" aria-live="polite">${material.videoUrl ? 'Memuat video…' : 'Materi ini tersedia dalam bentuk modul atau latihan.'}</div><div class="cinema-details"><p>${e(byId(db.tables.subjects, material.subjectId)?.name || 'Materi umum')} · ${e(byId(db.tables.users, material.teacherId)?.name || 'Tim Markaz')}</p><p>${e(material.description)}</p><div class="card-actions">${resourceLinks(material)}${safeUrl(material.videoUrl) ? `<a class="btn btn-secondary btn-sm" href="${e(safeUrl(material.videoUrl))}" target="_blank" rel="noopener noreferrer">Buka sumber ↗</a>` : ''}</div></div>
    ${student ? `<section class="smart-notes"><div class="panel-head"><h3>Catatan Santri</h3><label class="done-label"><input id="cinema-done" type="checkbox" ${learning?.done ? 'checked' : ''}> Tandai Selesai</label></div><label for="cinema-note">Rangkuman dan pertanyaanmu</label><textarea id="cinema-note" maxlength="50000" placeholder="Tulis poin penting pelajaran ini…"></textarea><div class="note-footer"><span id="cinema-note-status" role="status">Catatan disimpan otomatis.</span><button class="btn btn-secondary btn-sm" type="button" id="download-note">Unduh Catatan (.txt)</button></div></section>` : ''}`, true, 'cinema-modal');
  let alive = true, source = null, unsaved = false;
  view.onClose(() => {
    alive = false;
    const video = $('video', view.dialog);
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
    const iframe = $('iframe', view.dialog); if (iframe) iframe.src = 'about:blank';
    source?.release();
    if (unsaved) setTimeout(() => showToast('Catatan terakhir belum tersimpan. Buka kembali materi dan simpan salinan TXT sebelum meninggalkan halaman.', 'error'), 0);
  });
  if (student) {
    const noteKey = `${user.id}:${materialId}`;
    const note = $('#cinema-note', view.dialog); note.value = pendingNotes.get(noteKey) ?? learning?.note ?? '';
    unsaved = pendingNotes.has(noteKey);
    note.oninput = () => {
      try { assert(requireRole('student').id === user.id, 'Sesi akun berubah.'); saveLearning(materialId, {note: note.value}); pendingNotes.delete(noteKey); unsaved = false; $('#cinema-note-status', view.dialog).textContent = 'Tersimpan otomatis.'; }
      catch (error) { unsaved = true; pendingNotes.set(noteKey, note.value); $('#cinema-note-status', view.dialog).textContent = `Belum tersimpan: ${error.message} Unduh TXT untuk menyimpan salinan.`; }
    };
    $('#cinema-done', view.dialog).onchange = event => {
      try { assert(requireRole('student').id === user.id, 'Sesi akun berubah.'); saveLearning(materialId, {done: event.target.checked}); renderDashboard(); }
      catch (error) { event.target.checked = !event.target.checked; showToast(error.message, 'error'); }
    };
    $('#download-note', view.dialog).onclick = () => download(new Blob([
      `${MARKAZ_INFO.name}\n${material.title}\n${user.name} · ${user.nia}\n${formatDate(cairoDate())}\n\n${note.value}`
    ], {type: 'text/plain;charset=utf-8'}), `Catatan-${materialId}.txt`);
  }
  if (!material.videoUrl) return;
  try {
    source = await acquireVideoSource(material.videoUrl);
    if (!alive || generation !== cinemaGeneration) { source.release(); return; }
    const stage = $('.cinema-stage', view.dialog), embed = toEmbedUrl(source.url);
    if (embed) stage.innerHTML = `<iframe title="${e(material.title)}" src="${e(embed)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    else if (material.videoUrl.startsWith('idb://') || /^data:video\//.test(source.url) || safeUrl(source.url) && /\.(mp4|webm|ogg)([?#].*)?$/i.test(source.url)) {
      stage.innerHTML = `<video src="${e(source.url)}" controls autoplay playsinline preload="metadata"></video>`;
      $('video', stage).addEventListener('error', () => {
        if (!alive) return;
        const message = document.createElement('p'); message.className = 'player-error'; message.setAttribute('role', 'alert');
        message.textContent = 'Video tidak dapat diputar. Periksa codec, jaringan atau buka sumber videonya.'; stage.after(message);
      }, {once: true});
    } else stage.textContent = 'Sumber video ini belum mendukung pemutaran di sini. Gunakan tombol Buka sumber.';
  } catch (error) { if (alive) $('.cinema-stage', view.dialog).textContent = error.message; }
}
function openReview(enrollmentId, decision) {
  const db = getDatabase(), item = byId(db.tables.enrollments, enrollmentId);
  assert(item, 'Pengajuan tidak ditemukan.');
  const view = openDialog(decision === 'active' ? 'Verifikasi pembayaran dan aktifkan' : 'Tolak pengajuan',
    `<p>${e(byId(db.tables.users, item.studentId)?.name)} · ${e(byId(db.tables.programs, item.programId)?.name)}</p>` + formStart('review', db) +
    (decision === 'active' ? field('endDate', 'Tanggal akhir langganan (opsional)', '', 'date', `min="${cairoDate()}"`) : '') +
    textarea('note', 'Catatan untuk santri', '', 'maxlength="2000"') + formEnd(decision === 'active' ? 'Pembayaran terverifikasi · Aktifkan' : 'Tolak pengajuan'));
  bindForm(view, (data, form, revision) => {
    reviewEnrollment(enrollmentId, decision, data, revision); view.close(); renderDashboard(); showToast('Status langganan berhasil diperbarui.', 'success');
  });
}
function openMaterialForm(id = '') {
  const db = getDatabase(), user = requireRole('teacher', 'admin', 'executive');
  const old = byId(db.tables.materials, id);
  assert(!id || old && (isStaff(user) || old.teacherId === user.id), 'Materi tidak dapat diedit.');
  const assignments = db.tables.assignments.filter(a => a.teacherId === user.id && a.active);
  const programs = user.role === 'teacher' ? db.tables.programs.filter(p => assignments.some(a => a.programId === p.id)) : db.tables.programs;
  if (!programs.length && user.role === 'teacher') return openDialog('Belum ada penugasan', '<p>Eksekutif perlu menetapkan program dan madah sebelum kamu mengunggah materi.</p>');
  const view = openDialog(old ? 'Edit materi pembelajaran' : 'Tambah materi pembelajaran', formStart('material', db) +
    field('title', 'Judul materi', old?.title, 'text', 'required maxlength="160"') +
    select('programId', 'Program', (user.role !== 'teacher' ? '<option value="">Seluruh Program (materi umum)</option>' : '') + options(programs, old?.programId || programs[0]?.id)) +
    (user.role !== 'teacher' ? checkbox('general', 'Materi umum untuk seluruh santri berlangganan pada program ini', old?.general) : '') +
    '<div data-material-subject></div>' +
    field('videoUrl', old?.videoUrl.startsWith('idb://') ? 'URL video pengganti (opsional)' : 'URL video (opsional)', safeUrl(old?.videoUrl) || '', 'url', 'placeholder="https://…"') +
    field('videoFile', 'Atau pilih file video lokal', '', 'file', 'accept="video/*,.mp4,.webm,.ogg,.mkv"') +
    (old?.videoUrl ? checkbox('keepVideo', 'Pertahankan video lama jika tidak diisi pengganti', true) : '') +
    '<p class="file-note">File lokal tersimpan pada browser ini. Sertakan video saat backup untuk pindah perangkat.</p>' +
    field('pdfUrl', 'Link Modul PDF / Google Drive (opsional)', old?.pdfUrl, 'url') +
    field('quizUrl', 'Link Kuis / Latihan (opsional)', old?.quizUrl, 'url') +
    textarea('description', 'Deskripsi', old?.description, 'maxlength="3000"') + checkbox('published', 'Terbitkan materi', old?.published !== false) + formEnd('Simpan materi'), true);
  const form = bindForm(view, async (data, form, revision) => {
    const file = form.elements.videoFile.files[0];
    view.locked = true; $('[data-close]', view.dialog).disabled = true;
    try {
      await saveMaterial({...data, id, general: !!data.general, keepVideo: !!data.keepVideo, published: !!data.published}, file, revision);
      view.locked = false; view.close(); renderDashboard(); showToast('Materi berhasil disimpan.', 'success');
    } finally { view.locked = false; $('[data-close]', view.dialog).disabled = false; }
  });
  const renderSubject = () => {
    const subjectIds = user.role === 'teacher' ? assignments.filter(a => a.programId === form.elements.programId.value).map(a => a.subjectId) : activeProgramSubjects(db, form.elements.programId.value);
    const general = !!form.elements.general?.checked;
    $('[data-material-subject]', form).innerHTML = general ? '<p class="file-note">Materi umum tetap memerlukan langganan aktif; tidak terbuka untuk akun tanpa program.</p>' :
      select('subjectId', 'Madah', options(db.tables.subjects.filter(s => subjectIds.includes(s.id)), old?.subjectId), 'required');
  };
  form.elements.programId.onchange = renderSubject; if (form.elements.general) form.elements.general.onchange = renderSubject; renderSubject();
}
function openEvaluation(studentId = '') {
  const db = getDatabase(), user = requireRole('teacher');
  const assignments = db.tables.assignments.filter(a => a.teacherId === user.id && a.active);
  assert(assignments.length, 'Belum ada penugasan guru.');
  const view = openDialog('Catatan Mutaba’ah Santri', formStart('evaluation', db) +
    select('assignmentId', 'Program / Madah', options(assignments, ui.assignmentId, a => `${byId(db.tables.programs, a.programId)?.name} · ${byId(db.tables.subjects, a.subjectId)?.name}`)) +
    '<div data-evaluation-student></div>' + textarea('body', 'Catatan perkembangan', '', 'required maxlength="4000"') + formEnd('Simpan catatan untuk santri'));
  const form = bindForm(view, (data, form, revision) => {
    const assignment = byId(assignments, data.assignmentId);
    saveEvaluation({...data, programId: assignment.programId, subjectId: assignment.subjectId}, revision);
    view.close(); renderDashboard(); showToast('Catatan perkembangan tersedia di dashboard santri.', 'success');
  });
  const roster = () => {
    const assignment = byId(assignments, form.elements.assignmentId.value);
    const students = teachingRoster(user.id, assignment.programId, assignment.subjectId, cairoDate(), db).map(row => row.student);
    $('[data-evaluation-student]', form).innerHTML = select('studentId', 'Santri', options(students, studentId, s => `${s.nia} · ${s.name}`), 'required');
  };
  form.elements.assignmentId.onchange = roster; roster();
}
function openAnnouncementForm(id = '') {
  const db = getDatabase(); requireRole('admin', 'executive');
  const old = byId(db.tables.announcements, id);
  const view = openDialog(old ? 'Edit pengumuman' : 'Terbitkan pengumuman', formStart('announcement', db) +
    field('title', 'Judul', old?.title, 'text', 'required maxlength="160"') +
    select('category', 'Kategori', ['Informasi', 'Akademik', 'Pendaftaran', 'Agenda'].map(name => `<option ${old?.category === name ? 'selected' : ''}>${name}</option>`).join('')) +
    textarea('body', 'Isi pengumuman', old?.body, 'required maxlength="5000"') + checkbox('published', 'Terbitkan ke halaman publik dan santri', old?.published !== false) + formEnd());
  bindForm(view, (data, form, revision) => {
    saveAnnouncement({...data, id, published: !!data.published}, revision); view.close(); renderDashboard(); showToast('Pengumuman tersimpan.', 'success');
  });
}
function openProgramForm(id = '') {
  requireRole('executive'); const db = getDatabase(), old = byId(db.tables.programs, id);
  const view = openDialog(old ? 'Edit program' : 'Tambah program', formStart('program', db) +
    field('name', 'Nama program', old?.name, 'text', 'required maxlength="150"') +
    textarea('description', 'Deskripsi', old?.description, 'maxlength="1000"') + checkbox('isOpen', 'Buka pendaftaran program', old?.isOpen) + formEnd());
  bindForm(view, (data, form, revision) => {
    saveProgram({...data, id, isOpen: !!data.isOpen}, revision); view.close(); renderDashboard(); showToast('Program tersimpan. Tambahkan madah, paket, dan jadwal bila ini program baru.', 'success');
  });
}
function openPackageList(programId) {
  requireRole('executive'); const db = getDatabase();
  const packages = db.tables.packages.filter(p => p.programId === programId);
  openDialog('Pengaturan paket program', `<p>${e(byId(db.tables.programs, programId)?.name)}</p><div class="stack">${packages.map(pack => `<article class="package-card"><h3>${e(pack.name)}</h3><p>${e(label(pack.mode))} · ${pack.minSubjects}–${pack.maxSubjects} madah</p>${badge(pack.isOpen ? 'active' : 'suspended', pack.isOpen ? 'Paket dibuka' : 'Paket ditutup')} ${button('edit-package', 'Edit paket', pack.id, 'btn-secondary')}</article>`).join('')}</div><div class="dialog-actions">${button('add-package', 'Tambah paket', programId)}</div>`);
}
function openPackageForm(id = '', programId = '') {
  requireRole('executive'); const db = getDatabase(), old = byId(db.tables.packages, id);
  programId = old?.programId || programId;
  const count = activeProgramSubjects(db, programId).length;
  const view = openDialog(old ? 'Edit paket' : 'Tambah paket', formStart('package', db) +
    field('name', 'Nama paket', old?.name, 'text', 'required maxlength="150"') +
    select('mode', 'Jenis paket', `<option value="all" ${old?.mode === 'all' ? 'selected' : ''}>Mutqin / Semua madah</option><option value="selected" ${old?.mode === 'selected' ? 'selected' : ''}>Reguler / Pilihan madah</option>`) +
    '<p class="file-note">Jenis paket yang sudah dipakai langganan tidak boleh diubah. Batas paket Mutqin mengikuti seluruh madah aktif.</p>' +
    `<div class="form-row">${field('minSubjects', 'Minimal pilihan', old?.minSubjects || 1, 'number', `min="1" max="${count}" required`)}${field('maxSubjects', 'Maksimal pilihan', old?.maxSubjects || count, 'number', `min="1" max="${count}" required`)}</div>` +
    checkbox('isOpen', 'Buka pendaftaran paket', old?.isOpen !== false) + formEnd());
  bindForm(view, (data, form, revision) => {
    savePackage({...data, id, programId, isOpen: !!data.isOpen}, revision); view.close(); renderDashboard(); openPackageList(programId);
  });
}
function openSubjects(programId) {
  requireRole('executive'); const db = getDatabase();
  const links = db.tables.programSubjects.filter(p => p.programId === programId);
  const view = openDialog('Pengaturan madah program', `<p>${e(byId(db.tables.programs, programId)?.name)}</p><div class="stack">${links.map(link => `<article class="program-control"><div><strong>${e(byId(db.tables.subjects, link.subjectId)?.name)}</strong><p>${link.active ? 'Tersedia untuk pengajuan baru' : 'Tidak ditawarkan untuk pengajuan baru'}</p></div><label class="switch"><input type="checkbox" data-subject-toggle="${e(link.id)}" ${link.active ? 'checked' : ''} aria-label="Tawarkan ${e(byId(db.tables.subjects, link.subjectId)?.name)}"><span class="switch-track"></span></label></article>`).join('')}</div><hr>` +
    formStart('subject', db) + select('subjectId', 'Tambahkan madah dari master', '<option value="">Buat nama madah baru</option>' + options(db.tables.subjects.filter(s => !links.some(l => l.subjectId === s.id)))) +
    field('name', 'Atau nama madah baru', '', 'text', 'maxlength="120"') + textarea('description', 'Deskripsi madah', '', 'maxlength="500"') + formEnd('Tambahkan madah'));
  bindForm(view, (data, form, revision) => {
    saveProgramSubject({...data, programId, active: true}, revision); view.close(); renderDashboard(); openSubjects(programId);
  });
}
function openTeacherForm(id = '') {
  requireRole('executive'); const db = getDatabase(), old = byId(db.tables.users, id);
  const usedCodes = db.tables.users.filter(u => u.role === 'teacher').map(u => Number(u.code.replace(/^UST-/, '')) || 0);
  const code = `UST-${String(Math.max(0, ...usedCodes) + 1).padStart(2, '0')}`;
  const view = openDialog(old ? 'Edit akun guru' : 'Tambah akun guru', formStart('teacher', db) +
    field('name', 'Nama Ustadz / Ustadzah', old?.name, 'text', 'required maxlength="150"') +
    `<div class="form-row">${field('code', 'Kode guru', old?.code || code, 'text', 'required maxlength="30"')}${field('email', 'Email', old?.email, 'email', 'required')}</div>` +
    field('password', old ? 'Kata sandi baru (opsional)' : 'Kata sandi awal', '', 'password', `${old ? '' : 'required'} minlength="6" maxlength="128" autocomplete="new-password"`) +
    field('title', 'Status jabatan', old?.title || 'Pengajar', 'text', 'required maxlength="150"') +
    select('status', 'Status akun', `<option value="active" ${old?.status === 'active' ? 'selected' : ''}>Aktif</option><option value="suspended" ${old?.status === 'suspended' ? 'selected' : ''}>Nonaktif</option>`) +
    field('phone', 'Nomor WhatsApp (opsional)', old?.phone, 'tel') + field('domicile', 'Domisili (opsional)', old?.domicile, 'text', 'maxlength="120"') + formEnd());
  bindForm(view, (data, form, revision) => {
    const teacher = saveTeacher({...data, id}, revision); view.close(); renderDashboard(); openAssignments(teacher.id);
  });
}
function openAssignments(teacherId) {
  requireRole('executive'); const db = getDatabase(), teacher = byId(db.tables.users, teacherId);
  assert(teacher?.role === 'teacher', 'Guru tidak ditemukan.');
  const assignments = db.tables.assignments.filter(a => a.teacherId === teacherId);
  const view = openDialog('Penugasan guru', `<p>${e(teacher.code)} · ${e(teacher.name)}</p><div class="stack">${assignments.map(a => `<article class="program-control"><div><strong>${e(byId(db.tables.programs, a.programId)?.name)} · ${e(byId(db.tables.subjects, a.subjectId)?.name)}</strong><p>${e(db.tables.schedules.filter(s => s.assignmentId === a.id && s.active).map(s => `${DAYS[s.weekday]} ${s.startTime}–${s.endTime}`).join(', ') || 'Jadwal belum diatur')}</p>${button('schedule-assignment', 'Atur hari / jam', a.id, 'btn-secondary')}</div><label class="switch"><input type="checkbox" data-assignment-toggle="${e(a.id)}" ${a.active ? 'checked' : ''} aria-label="Aktifkan penugasan ${e(byId(db.tables.subjects, a.subjectId)?.name)}"><span class="switch-track"></span></label></article>`).join('')}</div><hr>` +
    formStart('assignment', db) + select('programId', 'Program', options(db.tables.programs)) + '<div data-assignment-subject></div>' + formEnd('Tambahkan penugasan'), true);
  const form = bindForm(view, (data, form, revision) => {
    saveAssignment({...data, teacherId, active: true}, revision); view.close(); renderDashboard(); openAssignments(teacherId);
  });
  const subjects = () => {
    const ids = activeProgramSubjects(db, form.elements.programId.value);
    $('[data-assignment-subject]', form).innerHTML = select('subjectId', 'Madah', options(db.tables.subjects.filter(s => ids.includes(s.id))), 'required');
  };
  form.elements.programId.onchange = subjects; subjects();
}
function openScheduleForm(id = '', assignmentId = '') {
  requireRole('executive'); const db = getDatabase(), old = byId(db.tables.schedules, id);
  const assignments = db.tables.assignments.filter(a => a.active && canTeach(a.teacherId, a.programId, a.subjectId, db));
  assert(assignments.length, 'Tetapkan guru aktif pada program dan madah terlebih dahulu.');
  const view = openDialog(old ? 'Edit jadwal halaqah' : 'Tambah jadwal halaqah', formStart('schedule', db) +
    select('assignmentId', 'Penugasan guru', options(assignments, old?.assignmentId || assignmentId, a => `${byId(db.tables.users, a.teacherId)?.name} · ${byId(db.tables.programs, a.programId)?.name} · ${byId(db.tables.subjects, a.subjectId)?.name}`), 'required') +
    select('weekday', 'Hari', DAYS.slice(0, 5).map((day, index) => `<option value="${index}" ${old?.weekday === index ? 'selected' : ''}>${day}</option>`).join('')) +
    `<div class="form-row">${field('startTime', 'Jam mulai Kairo', old?.startTime || '16:00', 'time', 'required')}${field('endTime', 'Jam selesai Kairo', old?.endTime || '17:00', 'time', 'required')}</div>` +
    field('room', 'Ruangan', old?.room || '', 'text', 'required maxlength="120"') + checkbox('active', 'Jadwal aktif', old?.active !== false) + formEnd());
  bindForm(view, (data, form, revision) => {
    saveSchedule({...data, id, active: !!data.active}, revision); view.close(); renderDashboard(); showToast('Jadwal tersimpan.', 'success');
  });
}
function openStudentForm(id) {
  requireRole('admin', 'executive'); const db = getDatabase(), user = byId(db.tables.users, id);
  assert(user?.role === 'student', 'Santri tidak ditemukan.');
  const view = openDialog('Kelola akun santri', formStart('student', db) +
    field('name', 'Nama akun', user.name, 'text', 'required maxlength="150"') + field('nia', 'NIA', user.nia, 'text', 'required pattern="NIA[0-9]{3}" maxlength="6"') +
    field('email', 'Email', user.email, 'email', 'required') + field('phone', 'Nomor WhatsApp', user.phone, 'tel', 'required') + field('domicile', 'Domisili', user.domicile, 'text', 'required maxlength="120"') +
    field('password', 'Reset kata sandi (opsional)', '', 'password', 'minlength="6" maxlength="128" autocomplete="new-password"') +
    select('status', 'Status akun dasar', `<option value="active" ${user.status === 'active' ? 'selected' : ''}>Aktif</option><option value="suspended" ${user.status === 'suspended' ? 'selected' : ''}>Nonaktif</option>`) +
    '<p class="file-note">Program santri dikelola melalui langganan terverifikasi. Perubahan nama akun tidak mengubah nama resmi KTA.</p>' + formEnd());
  const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn btn-danger'; remove.textContent = 'Hapus akun'; $('.form-actions', view.dialog).prepend(remove);
  remove.onclick = async () => {
    view.close();
    if (await ask('Hapus akun santri?', `Akun ${user.name}, langganan, absensi, KTA, catatan dan progresnya akan dihapus. Buat backup terlebih dahulu bila masih dibutuhkan.`, 'Hapus akun')) {
      removeStudent(id); renderDashboard(); showToast('Akun santri dihapus.');
    }
  };
  bindForm(view, (data, form, revision) => {
    updateStudent({...data, id}, revision); view.close(); renderDashboard(); showToast('Akun santri diperbarui.', 'success');
  });
}
function openKtaStatus(studentId) {
  requireRole('admin', 'executive'); const db = getDatabase(), student = byId(db.tables.users, studentId);
  const request = db.tables.ktaRequests.find(k => k.studentId === studentId);
  const view = openDialog('Kelola status KTA', `<p>${e(student?.nia)} · ${e(student?.name)}</p>` +
    (request ? `<p class="file-note">Nama resmi: ${e(byId(db.tables.ktaNames, request.nameId)?.officialName || '—')}<br>Gmail: ${e(request.gmail || '—')}<br>WhatsApp: ${e(request.phone)}<br>Domisili: ${e(request.domicile)}</p>` : '') +
    formStart('kta-status', db) + select('status', 'Status kartu', options(['missing', 'requested', 'printing', 'active'].map(id => ({id, name: label(id)})), request?.status || 'missing')) + formEnd());
  bindForm(view, (data, form, revision) => {
    updateKtaStatus(studentId, data.status, revision); view.close(); renderDashboard(); showToast('Status KTA diperbarui.', 'success');
  });
}
function openMasterName(studentId) {
  requireRole('executive'); const db = getDatabase(), student = byId(db.tables.users, studentId);
  const names = db.tables.ktaNames.filter(n => n.studentId === studentId);
  const view = openDialog('Master nama resmi KTA', `<p>${e(student?.nia)} · ${e(student?.name)}</p><p class="file-note">Nama di sini menjadi pilihan resmi pada form KTA dan harus sesuai dengan master spreadsheet absensi.</p>` +
    formStart('master-name', db) + select('id', 'Pilih record', '<option value="">Tambah nama resmi</option>' + options(names, names[0]?.id, n => `${n.officialName}${n.active ? '' : ' (nonaktif)'}`)) +
    field('officialName', 'Nama lengkap sesuai master', names[0]?.officialName || student?.name, 'text', 'required maxlength="150"') + checkbox('active', 'Nama tersedia untuk dipilih santri', names[0]?.active !== false) + formEnd());
  const form = bindForm(view, (data, form, revision) => {
    saveMasterName({...data, id: data.id || undefined, studentId, active: !!data.active}, revision); view.close(); renderDashboard(); showToast('Nama resmi tersimpan.', 'success');
  });
  form.elements.id.onchange = () => {
    const record = byId(names, form.elements.id.value); form.elements.officialName.value = record?.officialName || student.name; form.elements.active.checked = record?.active !== false;
  };
}

export function studentsCsv(db = getDatabase()) {
  requireRole('admin', 'executive');
  const rows = [['NIA', 'Nama', 'Email', 'WhatsApp', 'Domisili', 'Status Akun', 'Program Aktif', 'Madah Aktif', 'Status KTA'],
    ...db.tables.users.filter(u => u.role === 'student').map(user => {
      const enrollments = getActiveEnrollments(user.id, db), ids = enrollments.map(item => item.id);
      return [user.nia, user.name, user.email, user.phone, user.domicile, label(user.status),
        enrollments.map(item => byId(db.tables.programs, item.programId)?.name).join('; '),
        [...new Set(db.tables.enrollmentSubjects.filter(link => ids.includes(link.enrollmentId)).map(link => byId(db.tables.subjects, link.subjectId)?.name))].join('; '),
        label(db.tables.ktaRequests.find(k => k.studentId === user.id)?.status || 'missing')];
    })];
  const cell = value => {
    let result = String(value ?? '');
    if (/^[\t\r\n]|^\s*[=+@-]/.test(result)) result = `'${result}`;
    return `"${result.replace(/"/g, '""')}"`;
  };
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n');
}
async function runBackup() {
  requireRole('executive');
  const includeMedia = $('#backup-media')?.checked !== false;
  const view = openDialog('Menyiapkan backup', '<p role="status">Sedang membaca database dan file video lokal. Tunggu sampai file selesai dibuat.</p>');
  view.locked = true; $('[data-close]', view.dialog).disabled = true;
  try {
    const payload = await createBackup(includeMedia);
    download(new Blob([JSON.stringify(payload)], {type: 'application/json'}), `Markaz-LMS-Backup-${cairoDate()}.json`);
    view.locked = false; view.close();
    showToast(payload.missingMedia.length ? `Backup dibuat. ${payload.missingMedia.length} file video tidak disertakan.` : 'Backup lengkap berhasil dibuat.', 'success');
  } catch (error) { view.locked = false; view.close(); showToast(error.message, 'error'); }
}
async function runRestore(file) {
  requireRole('executive'); if (restoreBusy) return;
  try {
    const payload = JSON.parse(await file.text()), db = validateBackup(payload);
    const missing = [...new Set(db.tables.materials.filter(m => m.videoUrl.startsWith('idb://') && !payload.media.some(f => m.videoUrl === `idb://${f.id}`)).map(m => m.videoUrl))].length;
    const message = `${db.tables.users.length} akun, ${db.tables.enrollments.length} langganan, ${db.tables.materials.length} materi, ${db.tables.schedules.length} jadwal. ${missing ? `${missing} file video tidak disertakan. ` : ''}Seluruh database saat ini akan diganti. Simpan backup sebelumnya terlebih dahulu. Setelah restore, masuk ulang menggunakan akun dari backup.`;
    if (!await ask('Pulihkan backup database?', message, 'Pulihkan database')) return;
    const view = openDialog('Memulihkan database', '<p role="status">Sedang menyimpan file dan database. Jangan tutup halaman sampai proses selesai.</p>');
    restoreBusy = true; view.locked = true; $('[data-close]', view.dialog).disabled = true;
    try { await restoreBackup(payload); view.locked = false; view.close(); location.replace('login.html'); }
    finally { restoreBusy = false; view.locked = false; if (view.dialog.isConnected) view.close(); }
  } catch (error) { showToast(`Restore gagal: ${error.message}`, 'error'); }
}
function openMoreNavigation() {
  const user = currentUser(); if (!user) return;
  const links = NAV[user.role];
  const view = openDialog('Semua menu', `<nav class="side-nav">${links.map(([id, glyph, title]) => `<a href="#${id}" data-jump="${id}"><span class="nav-icon">${icon(glyph)}</span>${e(title)}</a>`).join('')}${button('logout', `${icon('logout')}Keluar`, '', 'btn-secondary')}</nav>`);
  $$('[data-jump]', view.dialog).forEach(link => link.onclick = event => {
    event.preventDefault(); const target = document.getElementById(link.dataset.jump); view.close();
    history.replaceState(null, '', `#${link.dataset.jump}`); target?.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
    requestAnimationFrame(updateScrollSpy);
  });
}
async function handleAction(action, id, element) {
  if (restoreBusy) return;
  switch (action) {
    case 'logout': activeView?.close(); disconnectSheets(); clearSession(); location.assign('login.html'); break;
    case 'more-nav': openMoreNavigation(); break;
    case 'enroll': openEnrollment(); break;
    case 'play': await openCinema(id); break;
    case 'toggle-done': {
      const user = requireRole('student'), db = getDatabase();
      const old = db.tables.learning.find(l => l.studentId === user.id && l.materialId === id);
      saveLearning(id, {done: !old?.done}); renderDashboard(); break;
    }
    case 'completion-filter': ui.completion = id; renderMaterials();
      $$('.filter-chip').forEach(chip => { const active = chip.dataset.id === id; chip.classList.toggle('active', active); chip.setAttribute('aria-pressed', String(active)); }); break;
    case 'claim-kta': if (await ask('Konfirmasi kepemilikan KTA', 'Saya sudah memiliki Kartu Tanda At-Ta’allum untuk absensi.', 'Ya, sudah punya')) { claimKta(); renderDashboard(); showToast('Status kepemilikan KTA tersimpan.', 'success'); } break;
    case 'create-kta': openKtaForm(); break;
    case 'attendance': {
      const db = getDatabase(), assignment = byId(db.tables.assignments, ui.assignmentId);
      assert(assignment, 'Pilih penugasan terlebih dahulu.');
      saveAttendance({enrollmentId: id, subjectId: assignment.subjectId, date: ui.attendanceDate || cairoDate(), status: element.dataset.status}, db.meta.revision);
      renderDashboard(); showToast('Absensi tersimpan dan streak diperbarui.', 'success'); break;
    }
    case 'add-evaluation': openEvaluation(id); break;
    case 'add-material': openMaterialForm(); break;
    case 'edit-material': openMaterialForm(id); break;
    case 'remove-material': if (await ask('Hapus materi?', 'Materi beserta catatan dan progres terkait akan dihapus.')) { await removeMaterial(id); renderDashboard(); showToast('Materi dihapus.'); } break;
    case 'add-announcement': openAnnouncementForm(); break;
    case 'edit-announcement': openAnnouncementForm(id); break;
    case 'remove-announcement': if (await ask('Hapus pengumuman?', 'Pengumuman akan dihapus dari halaman publik dan dashboard.')) { removeAnnouncement(id); renderDashboard(); } break;
    case 'approve-enrollment': openReview(id, 'active'); break;
    case 'reject-enrollment': openReview(id, 'rejected'); break;
    case 'add-program': openProgramForm(); break;
    case 'edit-program': openProgramForm(id); break;
    case 'manage-packages': openPackageList(id); break;
    case 'add-package': openPackageForm('', id); break;
    case 'edit-package': openPackageForm(id); break;
    case 'manage-subjects': openSubjects(id); break;
    case 'add-teacher': openTeacherForm(); break;
    case 'edit-teacher': openTeacherForm(id); break;
    case 'manage-assignment': openAssignments(id); break;
    case 'remove-teacher': if (await ask('Hapus akun guru?', 'Akses akun akan dicabut. Jika ada riwayat absensi atau materi, akun diarsipkan agar catatan belajar tetap utuh.', 'Hapus / Arsipkan')) { const result = removeTeacher(id); renderDashboard(); showToast(result === 'archived' ? 'Akun guru diarsipkan; riwayat belajar tetap tersimpan.' : 'Akun guru dihapus.'); } break;
    case 'add-schedule': openScheduleForm(); break;
    case 'edit-schedule': openScheduleForm(id); break;
    case 'schedule-assignment': openScheduleForm('', id); break;
    case 'remove-schedule': if (await ask('Hapus jadwal?', 'Jadwal mendatang akan berubah. Riwayat absensi yang sudah tercatat tetap tersimpan.')) { removeSchedule(id); renderDashboard(); } break;
    case 'edit-student': openStudentForm(id); break;
    case 'manage-kta': openKtaStatus(id); break;
    case 'master-name': openMasterName(id); break;
    case 'export-csv': download(new Blob([studentsCsv()], {type: 'text/csv;charset=utf-8'}), `Markaz-Santri-${cairoDate()}.csv`); showToast('CSV berhasil dibuat.', 'success'); break;
    case 'backup': await runBackup(); break;
    case 'restore': requireRole('executive'); $('#restore-file')?.click(); break;
    case 'demo-fill': {
      const account = DEMO_ACCOUNTS.find(row => row.role === id);
      if (account) { $('#login-identifier').value = account.login; $('#login-password').value = account.password; $('#login-identifier').focus(); }
      break;
    }
  }
}
function authLayout(type) {
  const register = type === 'register';
  return `<main class="auth-layout"><aside class="auth-side">${brand('Portal pembelajaran')}<div class="auth-side-copy"><span class="eyebrow">${register ? 'Langkah pertama' : 'Selamat datang kembali'}</span><h1>${register ? 'Mulai dari niat, tumbuh bersama ilmu.' : 'Ilmu dan adab menemani setiap langkah.'}</h1><p>${register ? 'Buat akun dasar, lalu pilih program dan madah melalui dashboard santri.' : 'Satu portal untuk santri, asatidzah, pengelola dan eksekutif Markaz.'}</p></div><div class="auth-foot">Ilmu · Adab · Istiqomah</div></aside><section class="auth-main"><div class="auth-box"><span class="page-kicker">${register ? 'Pendaftaran santri' : 'Akses portal'}</span><h2>${register ? 'Buat akun santri' : 'Masuk ke portal'}</h2><p>${register ? 'Akun dasar langsung aktif. Program belajar dipilih setelah masuk.' : 'Gunakan email, NIA santri atau kode guru/staf.'}</p>
    <div class="form-error" id="auth-message" role="alert"></div>${register ? `<form id="register-form">${field('name', 'Nama lengkap', '', 'text', 'required maxlength="150" autocomplete="name"')}${field('email', 'Email aktif', '', 'email', 'required autocomplete="email"')}${field('phone', 'Nomor WhatsApp dengan kode negara', '', 'tel', 'required autocomplete="tel" placeholder="201xxxxxxxxx"')}${field('domicile', 'Domisili Kairo', '', 'text', 'required list="domicile-options" maxlength="120"')}<datalist id="domicile-options">${DOMICILES.map(name => `<option value="${e(name)}"></option>`).join('')}</datalist>${field('password', 'Kata sandi', '', 'password', 'required minlength="6" maxlength="128" autocomplete="new-password"')}${field('confirmPassword', 'Ulangi kata sandi', '', 'password', 'required minlength="6" maxlength="128" autocomplete="new-password"')}<button class="btn full" type="submit">Buat akun dan lanjutkan</button></form><div class="auth-switch">Sudah punya akun? <a href="login.html">Masuk</a></div>` : `<form id="login-form"><div class="form-group"><label for="login-identifier">Email / NIA / Kode Guru</label><input id="login-identifier" name="identifier" required autocomplete="username" placeholder="NIA001 atau UST-01 atau email"></div><div class="form-group"><label for="login-password">Kata sandi</label><input id="login-password" name="password" type="password" required autocomplete="current-password"></div><button class="btn full" type="submit">Masuk ${icon('arrow')}</button></form><div class="auth-switch">Belum punya akun santri? <a href="register.html">Daftar sekarang</a></div><div class="demo-hint"><strong>Coba akun demo empat role</strong><div class="demo-accounts">${DEMO_ACCOUNTS.map(account => `<div class="demo-account"><div><strong>${e(ROLES[account.role].label)}</strong><br><span>${e(account.login)} / ${e(account.password)}</span></div>${button('demo-fill', 'Isi demo', account.role, 'btn-secondary')}</div>`).join('')}</div><p class="file-note">Akun ini untuk mencoba aplikasi lokal. Dataset belum tersinkron antarperangkat.</p></div>`}
    </div></section></main>`;
}
function initAuth() {
  root.innerHTML = authLayout(page);
  const form = $('#login-form') || $('#register-form');
  form.onsubmit = event => {
    event.preventDefault(); const message = $('#auth-message'), submit = $('[type=submit]', form);
    message.textContent = ''; message.classList.remove('show'); submit.disabled = true;
    try {
      const data = readForm(form);
      if (page === 'register') {
        assert(data.password === data.confirmPassword, 'Kata sandi dan konfirmasi tidak sama.');
        const registered = registerStudent(data), user = login(registered.email, data.password);
        location.assign(ROLES[user.role].page);
      } else { const user = login(data.identifier, data.password); location.assign(ROLES[user.role].page); }
    } catch (error) { message.textContent = error.message; message.classList.add('show'); message.tabIndex = -1; message.focus(); }
    finally { submit.disabled = false; }
  };
}
function initLanding() {
  const db = getDatabase();
  if (!root.innerHTML.trim()) root.innerHTML = `<header class="topbar"><div class="container nav-wrap">${brand('Hayy Sabik · Kairo')}<nav class="nav-links" aria-label="Navigasi utama"><a href="#program">Program</a><a href="#pengumuman">Kabar Markaz</a></nav><div class="nav-actions"><a class="btn btn-secondary" href="login.html">Masuk</a><a class="btn" href="register.html">Daftar Santri</a></div></div></header><main><section class="container hero"><div><span class="eyebrow">Berdiri sejak ${MARKAZ_INFO.founded}</span><h1>Membimbing generasi dengan <em>ilmu dan adab.</em></h1><p class="hero-copy">Bimbingan belajar Ma’had Al-Azhar dan Bahasa Arab di Hayy Sabik, Kairo. Pilih program dan madah sesuai perjalanan ilmumu.</p><div class="hero-actions"><a class="btn btn-orange" href="register.html">Mulai Perjalanan Ilmu ${icon('arrow')}</a><a class="btn btn-secondary" href="#program">Lihat Program</a></div></div><div class="hero-art"><div class="art-glow"></div><div class="learning-card"><span class="book-icon">${icon('book')}</span><h3>Mau · Sadar · Tekad</h3><p>Ilmu yang baik tumbuh bersama niat dan istiqomah.</p><span class="badge blue">${e(MARKAZ_INFO.motto)}</span></div></div></section><section id="program" class="container section"><div class="section-head"><div><span class="eyebrow">Perjalanan belajar</span><h2>Program Markaz</h2></div></div><div id="public-programs" class="feature-grid"></div></section><section id="pengumuman" class="container section"><div class="section-head"><h2>Kabar Markaz</h2></div><div class="announcement-grid" id="public-announcements"></div></section><section class="container cta-strip"><div><h2>Siap bertumbuh bersama?</h2><p>${e(MARKAZ_INFO.location)}</p></div><a class="btn" href="https://wa.me/${MARKAZ_INFO.whatsappClean}" target="_blank" rel="noopener noreferrer">Konsultasi Program</a></section></main><footer class="footer"><div class="container footer-inner"><span>© <span id="year"></span> ${e(MARKAZ_INFO.name)}</span><span>Ilmu · Adab · Istiqomah</span></div></footer>`;
  $$('.brand-mark').forEach(node => { node.innerHTML = BRAND_LOGO_SVG; });
  $$('.nav-icon:empty,.stat-symbol:empty,.feature-icon:empty,.book-icon:empty,.notice-mark:empty').forEach(node => { node.innerHTML = icon(node.dataset.icon || 'book'); });
  if ($('#year')) $('#year').textContent = String(new Date(`${cairoDate()}T12:00:00Z`).getUTCFullYear());
  if ($('#public-programs')) $('#public-programs').innerHTML = db.tables.programs.map(program => `<article class="feature-card"><span class="feature-icon">${icon('book')}</span>${badge(program.isOpen ? 'active' : 'suspended', program.isOpen ? 'Pendaftaran dibuka' : 'Pendaftaran ditutup')}<h3>${e(program.name)}</h3><p>${e(program.description)}</p><a class="btn btn-secondary btn-sm" href="${program.isOpen ? 'register.html' : `https://wa.me/${MARKAZ_INFO.whatsappClean}`}">${program.isOpen ? 'Buat akun dan pilih program' : 'Tanya jadwal pembukaan'}</a></article>`).join('');
  if ($('#public-announcements')) {
    const items = db.tables.announcements.filter(a => a.published).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);
    $('#public-announcements').innerHTML = items.length ? items.map(item => `<article class="announcement-card"><div class="announcement-meta">${e(item.category)} · ${e(formatDate(item.createdAt))}</div><h3>${e(item.title)}</h3><p>${e(item.body)}</p></article>`).join('') : empty('Belum ada kabar terbaru');
  }
}
export function bootstrap() {
  page = document.body.dataset.page || 'landing';
  root = $('#app');
  if (!root) { root = document.createElement('div'); root.id = 'app'; document.body.replaceChildren(root); }
  try {
    initializeDatabase();
    if (page === 'login' || page === 'register') initAuth();
    else if (NAV[page]) renderDashboard();
    else initLanding();
  } catch (error) {
    root.innerHTML = `<main class="container section"><article class="panel">${empty('Portal belum dapat dimuat', error.message)}<p class="file-note">Simpan data situs yang ada. Hubungi pengelola untuk memulihkan backup bila diperlukan.</p></article></main>`;
  }
  // Motion is a progressive visual layer; it never touches application data.
  try { initMotionEnhancements(root); } catch (error) { console.warn('Motion enhancement skipped:', error); }
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-action]'); if (!target || target.disabled) return;
    event.preventDefault(); Promise.resolve().then(() => handleAction(target.dataset.action, target.dataset.id || '', target)).catch(error => showToast(error.message, 'error'));
  });
  document.addEventListener('change', event => {
    const target = event.target;
    try {
      if (target.matches('[data-program-toggle]')) {
        const program = byId(getDatabase().tables.programs, target.dataset.programToggle);
        saveProgram({...program, isOpen: target.checked}); renderDashboard(); showToast('Status pendaftaran program diperbarui.', 'success');
      } else if (target.matches('[data-subject-toggle]')) {
        const link = byId(getDatabase().tables.programSubjects, target.dataset.subjectToggle);
        saveProgramSubject({...link, active: target.checked}); renderDashboard(); openSubjects(link.programId);
      } else if (target.matches('[data-assignment-toggle]')) {
        const assignment = byId(getDatabase().tables.assignments, target.dataset.assignmentToggle);
        saveAssignment({...assignment, active: target.checked}); renderDashboard(); openAssignments(assignment.teacherId);
      }
    } catch (error) { target.checked = !target.checked; showToast(error.message, 'error'); }
  });
  let scrollQueued = false;
  window.addEventListener('scroll', () => { if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(() => { scrollQueued = false; updateScrollSpy(); }); } }, {passive: true});
  window.addEventListener('resize', updateScrollSpy);
  window.addEventListener('hashchange', updateScrollSpy);
  window.addEventListener('pagehide', () => { if (activeView) { activeView.locked = false; activeView.close(); } });
  window.addEventListener('storage', event => {
    if (![STORAGE_KEYS.database, STORAGE_KEYS.session].includes(event.key) || restoreBusy) return;
    try {
      if (NAV[page]) {
        const user = currentUser();
        if (!user || user.role !== page) { activeView?.close(); location.replace(user ? ROLES[user.role].page : 'login.html'); return; }
        if (activeView?.dialog.id === 'cinema-modal') activeView.close();
        renderDashboard(); showToast('Data diperbarui dari tab lain. Form yang terbuka perlu dibuka ulang sebelum disimpan.');
      } else if (page === 'landing') initLanding();
    } catch (error) { showToast(error.message, 'error'); }
  });
  setInterval(() => {
    if (!NAV[page] || restoreBusy) return;
    try {
      if (!currentUser()) { activeView?.close(); location.replace('login.html'); }
      else if (ui.lastDate !== cairoDate()) renderDashboard();
    } catch (error) { showToast(error.message, 'error'); }
  }, 30000);
}
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap, {once: true});
  else bootstrap();
}
