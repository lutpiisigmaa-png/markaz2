// Markaz At-Ta'allum LMS v6 — lapisan data lokal, tanpa dependensi.
export const SCHEMA_VERSION = 6;
export const STORAGE_KEYS = Object.freeze({
  database: 'mat_lms_database_v6',
  session: 'mat_lms_session_v6',
  legacyV5: 'mat_database_v5'
});
export const MARKAZ_INFO = Object.freeze({
  name: "Markaz At-Ta'allum",
  tagline: 'Membimbing Generasi dengan Ilmu dan Adab',
  motto: 'Menerangi Ilmu dengan Hati',
  founder: 'Hilwah Habibah',
  founded: 2024,
  location: 'Hayy Sabik, Kairo, Mesir',
  timezone: 'Africa/Cairo',
  phone: '+20 155 101 8457',
  whatsappClean: '201551018457',
  ktaWhatsapp: '201507369779',
  email: 'attaallumy@gmail.com',
  instagram: '@attaallumarkaz'
});
export const ROLES = Object.freeze({
  student: {label: 'Santri', page: 'student-dash.html'},
  teacher: {label: 'Guru / Asatidzah', page: 'teacher-dash.html'},
  admin: {label: 'Admin Operasional', page: 'admin-dash.html'},
  executive: {label: 'Eksekutif', page: 'executive-dash.html'}
});
export const DAYS = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export const HOLIDAYS = Object.freeze([5, 6]);
export const DOMICILES = ["Hayy Sabi'", 'Hayy Asyir', 'Darrasah', 'Nasr City', "Raba'ah", 'Muqattam', 'Lainnya'];
export const DEMO_ACCOUNTS = Object.freeze([
  {role: 'student', login: 'NIA001', email: 'santri@markaz.test', password: 'santri123'},
  {role: 'teacher', login: 'UST-01', email: 'guru@markaz.test', password: 'guru12345'},
  {role: 'admin', login: 'OPS-01', email: 'admin@markaz.test', password: 'admin123'},
  {role: 'executive', login: 'EXE-01', email: 'eksekutif@markaz.test', password: 'eksekutif123'}
]);

// Satu baris = satu record Spreadsheet. Relasi jamak memakai tabel penghubung.
const COLUMNS = {
  users: 'id nia code name email phone domicile password role status title',
  programs: 'id name description isOpen',
  packages: 'id programId name mode isOpen minSubjects maxSubjects',
  subjects: 'id name description',
  programSubjects: 'id programId subjectId active',
  assignments: 'id teacherId programId subjectId active',
  schedules: 'id assignmentId weekday startTime endTime room active',
  enrollments: 'id studentId programId packageId status requestedAt reviewedAt reviewedBy reviewNote startDate endDate',
  enrollmentSubjects: 'id enrollmentId subjectId',
  attendance: 'id studentId enrollmentId subjectId date status teacherId countsForStreak',
  materials: 'id programId subjectId teacherId title description videoUrl pdfUrl quizUrl general published',
  announcements: 'id title body category published authorId',
  evaluations: 'id studentId teacherId programId subjectId body',
  learning: 'id studentId materialId done note',
  ktaNames: 'id studentId officialName active',
  ktaRequests: 'id studentId nameId gmail phone domicile status source requestedAt whatsappOpenedAt'
};
export const TABLE_COLUMNS = Object.freeze(Object.fromEntries(
  Object.entries(COLUMNS).map(([name, fields]) => [name, Object.freeze(`${fields} createdAt updatedAt`.split(' '))])
));
export const TABLE_NAMES = Object.freeze(Object.keys(TABLE_COLUMNS));
export const STATUS_LABELS = Object.freeze({
  active: 'Aktif', suspended: 'Nonaktif', pending: 'Menunggu verifikasi pembayaran',
  rejected: 'Ditolak', expired: 'Berakhir', hadir: 'Hadir', izin: 'Izin', alpha: 'Alpha',
  requested: 'Pengajuan terkirim', printing: 'Proses cetak', missing: 'Belum ada',
  all: 'Intensif penuh', selected: 'Pilihan madah'
});
export const BRAND_LOGO_SVG = `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M26 48c10-2 20-1 28 3V25c-8-4-18-5-28-3" stroke="#1677c8" stroke-width="4" stroke-linejoin="round"/><path d="M32 42c8-2 15-1 22 2" stroke="#38bdf8" stroke-width="3"/><path d="M18 46C10 34 12 20 22 12c-6 10-7 22-1 32" fill="#1677c8"/><path d="M18 56C20 40 26 20 38 6c3 10 1 18-4 23 6 0 4 4 1 6 3 2-1 6-4 8-5 4-10 9-13 13Z" fill="#f59e0b"/><path d="m18 56 13-27" stroke="#ea580c" stroke-width="2"/></svg>`;
const ICON_PATHS = {
  home: '<path d="m3 10 9-7 9 7v10H4V10m5 10v-6h6v6"/>',
  book: '<path d="M12 6v15M3 4c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2Z"/>',
  users: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-17a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3"/>',
  video: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 8 6 4-6 4Z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-14 4h3m4 0h3"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-9 13h6"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  id: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="10" r="2"/><path d="M5 16c0-3 6-3 6 0m3-6h4m-4 4h4"/>',
  flame: '<path d="M13 3c1 5-3 6-3 9-2-1-3-3-3-3-3 4-4 10 1 12 7 3 13-3 10-9-1-2-2-3-2-3 0 3-2 4-2 4 2-5-1-10-1-10Z"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  chart: '<path d="M4 3v18h17M8 17v-5m5 5V7m5 10v-8"/>',
  edit: '<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14Z"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  logout: '<path d="M9 3H4v18h5m5-14 5 5-5 5m-6-5h13"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  file: '<path d="M14 3H5v18h14V8Zm0 0v5h5M8 12h8m-8 4h6"/>',
  trophy: '<path d="M8 3h8v7a4 4 0 0 1-8 0ZM8 5H3v2a5 5 0 0 0 5 5m8-7h5v2a5 5 0 0 1-5 5m-4 2v6m-4 1h8"/>',
  snow: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>'
};
export function icon(name = 'book') {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${Object.hasOwn(ICON_PATHS,name) ? ICON_PATHS[name] : ICON_PATHS.book}</svg>`;
}
export const now = () => new Date().toISOString();
export function createId(prefix = 'row') {
  const id = globalThis.crypto.randomUUID?.() || Array.from(
    globalThis.crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2,'0')
  ).join('');
  return `${prefix}-${id}`;
}
export const clone = value => structuredClone(value);
export function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
}
export function safeUrl(value = '') {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}
export function getYoutubeId(value = '') {
  try {
    const url = new URL(value);
    const id = url.hostname === 'youtu.be' ? url.pathname.slice(1) :
      ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].includes(url.hostname)
        ? url.searchParams.get('v') || url.pathname.split('/')[2] : '';
    return /^[\w-]{11}$/.test(id || '') ? id : '';
  } catch { return ''; }
}
export function toEmbedUrl(value = '') {
  const id = getYoutubeId(value);
  if (id) return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/file\/d\/([\w-]+)/);
    return url.hostname === 'drive.google.com' && match ? `https://drive.google.com/file/d/${match[1]}/preview` : '';
  } catch { return ''; }
}
export function cairoDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MARKAZ_INFO.timezone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(value));
  const get = type => parts.find(part => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function isDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export const weekday = date => new Date(`${date}T12:00:00Z`).getUTCDay();
export function addDays(date, amount) {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + amount);
  return result.toISOString().slice(0, 10);
}
export function formatDate(value, options = {}) {
  if (!value) return '—';
  const date = new Date(isDateKey(value) ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: MARKAZ_INFO.timezone, day: 'numeric', month: 'short', year: 'numeric', ...options
  }).format(date);
}
function row(table, data) {
  const timestamp = now();
  return Object.fromEntries(TABLE_COLUMNS[table].map(key => [key,
    data[key] ?? (['createdAt', 'updatedAt'].includes(key) ? timestamp : '')
  ]));
}

export function createSeedDatabase() {
  const db = {
    schemaVersion: SCHEMA_VERSION,
    meta: {revision: 0, niaSerial: 3, createdAt: now(), updatedAt: now(), migratedFrom: ''},
    tables: Object.fromEntries(TABLE_NAMES.map(name => [name, []]))
  };
  const put = (table, data) => { const item = row(table, data); db.tables[table].push(item); return item; };
  const people = [
    ['student-1','NIA001','', 'Ahmad Hijazil Mumtaz','santri@markaz.test','santri123','student'],
    ['student-2','NIA002','', 'Adinda Dania Sabrina','adinda@markaz.test','santri123','student'],
    ['student-3','NIA003','', 'Salma Putri','salma@markaz.test','santri123','student'],
    ['teacher-1','','UST-01','Ustadz Yusuf (Demo)','guru@markaz.test','guru12345','teacher'],
    ['teacher-2','','UST-02','Ustadzah Maryam (Demo)','guru2@markaz.test','guru12345','teacher'],
    ['admin-1','','OPS-01','Admin Operasional','admin@markaz.test','admin123','admin'],
    ['executive-1','','EXE-01','Eksekutif Markaz','eksekutif@markaz.test','eksekutif123','executive']
  ];
  for (const [id, nia, code, name, email, password, role] of people) {
    put('users', {id, nia, code, name, email, password, role, phone: '201000000000',
      domicile: "Hayy Sabi'", status: 'active', title: role === 'teacher' ? 'Pengajar' : ''});
    if (role === 'student') put('ktaNames', {id: `name-${id}`, studentId: id, officialName: name, active: true});
  }
  const subjectNames = ['Nahwu','Shorof','Balaghah',"Qiro'ah","Insya'",'Mantiq','Mawaris','Tajwid','Ammiyyah','Materi Umum'];
  subjectNames.forEach((name, index) => put('subjects', {id: `subject-${index + 1}`, name, description: `Madah ${name}`}));
  const programs = [
    ['qobul','Program Qobul',[1,2,3,4,5,6,7],true],
    ['idady',"Musabaqoh I'dady",[1,2,3,4,5],true],
    ['tsanawi',"Musabaqoh / Mu'adalah Tsanawi",[1,2,3,6,7],true],
    ['lughoh','Lughoh Azhary',[1,2,4,5],true],
    ['istimewa','Program Istimewa',[1,6,7,8,9],true],
    ['privat','Privat',[1,2,3,4,5,6,7,8,9,10],false]
  ];
  for (const [id, name, subjectNumbers, isOpen] of programs) {
    put('programs', {id, name, description: `Bimbingan ${name} di Markaz At-Ta'allum.`, isOpen});
    put('packages', {id: `${id}-mutqin`, programId: id, name: 'Mutqin — Intensif Penuh',
      mode: 'all', isOpen: true, minSubjects: subjectNumbers.length, maxSubjects: subjectNumbers.length});
    put('packages', {id: `${id}-reguler`, programId: id, name: 'Mubsyit / Reguler',
      mode: 'selected', isOpen: true, minSubjects: 1, maxSubjects: subjectNumbers.length});
    subjectNumbers.forEach(number => {
      const subjectId = `subject-${number}`;
      put('programSubjects', {id: `${id}-${subjectId}`, programId: id, subjectId, active: true});
      const assignmentId = `assign-${id}-${number}`;
      put('assignments', {id: assignmentId, teacherId: number % 2 ? 'teacher-1' : 'teacher-2',
        programId: id, subjectId, active: true});
      const hour = 9 + programs.findIndex(item => item[0] === id) * 2 + (number > 5 ? 1 : 0);
      put('schedules', {id: `schedule-${id}-${number}`, assignmentId, weekday: (number - 1) % 5,
        startTime: `${String(hour).padStart(2,'0')}:00`, endTime: `${String(hour + 1).padStart(2,'0')}:00`, room: `Ruang ${id}`, active: true});
    });
  }
  const startDate = addDays(cairoDate(), -30);
  for (const [studentId, packageId, selected] of [
    ['student-1','qobul-mutqin',[1,2,3,4,5,6,7]],
    ['student-2','qobul-reguler',[1,6]]
  ]) {
    const enrollmentId = `enrollment-${studentId}`;
    put('enrollments', {id: enrollmentId, studentId, programId: 'qobul', packageId, status: 'active',
      requestedAt: now(), reviewedAt: now(), reviewedBy: 'admin-1', reviewNote: 'Data demo', startDate, endDate: ''});
    selected.forEach(number => put('enrollmentSubjects', {
      id: `${enrollmentId}-${number}`, enrollmentId, subjectId: `subject-${number}`
    }));
    let date = addDays(cairoDate(), -1), saved = 0;
    while (saved < 3) {
      const required = !HOLIDAYS.includes(weekday(date)) && (studentId === 'student-1' || weekday(date) === 0);
      if (required) {
        const number = studentId === 'student-1' ? weekday(date) + 1 : 1;
        put('attendance', {id: `attendance-${studentId}-${date}`, studentId, enrollmentId,
          subjectId: `subject-${number}`, date, status: 'hadir', teacherId: number % 2 ? 'teacher-1' : 'teacher-2', countsForStreak: true});
        saved++;
      }
      date = addDays(date, -1);
    }
  }
  put('materials', {id: 'material-1', programId: 'qobul', subjectId: 'subject-1', teacherId: 'teacher-1',
    title: 'Mengenal Kalam dan Pembagiannya', description: 'Contoh teknis video; ganti dengan rekaman Nahwu lembaga.',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    pdfUrl: '', quizUrl: '', general: false, published: true});
  put('materials', {id: 'material-2', programId: 'qobul', subjectId: 'subject-2', teacherId: 'teacher-2',
    title: 'Pengantar Tashrif', description: 'Contoh teknis sematan; ganti dengan rekaman Shorof lembaga.',
    videoUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', pdfUrl: '', quizUrl: '', general: false, published: true});
  put('announcements', {id: 'announcement-1', title: 'Ahlan wa Sahlan di Markaz',
    body: 'Pilih program, paket dan madahmu. Akses materi dibuka setelah verifikasi pembayaran oleh admin.',
    category: 'Informasi', published: true, authorId: 'admin-1'});
  put('evaluations', {id: 'evaluation-1', studentId: 'student-1', teacherId: 'teacher-1',
    programId: 'qobul', subjectId: 'subject-1', body: 'Contoh mutaba’ah: ulangi pembagian kalam dan siapkan contoh jumlah ismiyyah.'});
  return db;
}

// Migrasi tidak menghapus kunci v4/v5. Materi lama menjadi materi umum programnya.
function migrateLegacy(legacy, sourceKey) {
  const db = createSeedDatabase(), t = db.tables;
  t.users = t.users.filter(user => user.role !== 'student' && !legacy.users.some(old => old.email?.toLowerCase() === user.email));
  for (const table of ['enrollments','enrollmentSubjects','attendance','learning','ktaNames','evaluations','materials','announcements','schedules','assignments']) t[table] = [];
  const programFor = className => {
    let program = t.programs.find(item => item.name === className);
    if (!program) {
      program = row('programs', {id: createId('program'), name: className || 'Program Migrasi',
        description: 'Program hasil migrasi; tinjau paket, madah dan penugasan.', isOpen: false});
      t.programs.push(program);
      t.packages.push(row('packages', {id: `${program.id}-mutqin`, programId: program.id,
        name: 'Mutqin — Migrasi', mode: 'all', isOpen: true, minSubjects: 1, maxSubjects: 1}));
    }
    if (!t.programSubjects.some(link => link.programId === program.id && link.subjectId === 'subject-10'))
      t.programSubjects.push(row('programSubjects', {id: createId('ps'), programId: program.id, subjectId: 'subject-10', active: true}));
    return program;
  };
  const used = new Set(), validNias = legacy.users.filter(u => u.role === 'student' && /^NIA\d{3}$/.test(u.nia || '') && u.nia !== 'NIA000').map(u => u.nia);
  let serial = 0;
  for (const old of legacy.users) {
    if (!['student','teacher','admin','executive'].includes(old.role)) throw new Error('Role data lama tidak dikenali.');
    let nia = '';
    if (old.role === 'student') {
      nia = /^NIA\d{3}$/.test(old.nia || '') && old.nia !== 'NIA000' && !used.has(old.nia) ? old.nia : '';
      while (!nia) {
        const candidate = `NIA${String(++serial).padStart(3,'0')}`;
        if (serial > 999) throw new Error('Migrasi melebihi kapasitas NIA999.');
        if (!used.has(candidate) && !validNias.includes(candidate)) nia = candidate;
      }
      used.add(nia);
    }
    const user = row('users', {id: old.id, nia, code: old.role === 'student' ? '' : old.code || `LEGACY-${old.id}`,
      name: old.name, email: old.email.toLowerCase(), phone: old.phone || '', domicile: old.domicile || '',
      password: old.password, role: old.role, status: old.status === 'suspended' ? 'suspended' : 'active', title: old.title || ''});
    t.users = t.users.filter(item => item.id !== user.id); t.users.push(user);
    if (user.role !== 'student') continue;
    t.ktaNames.push(row('ktaNames', {id: createId('name'), studentId: user.id, officialName: user.name, active: true}));
    if (old.classLevel) {
      const program = programFor(old.classLevel), packageId = t.packages.find(p => p.programId === program.id && p.mode === 'all').id;
      const enrollmentId = createId('enrollment');
      t.enrollments.push(row('enrollments', {id: enrollmentId, studentId: user.id, programId: program.id, packageId,
        status: ['pending','rejected'].includes(old.status) ? old.status : 'active', requestedAt: old.createdAt || now(),
        reviewedAt: '', reviewedBy: '', reviewNote: 'Migrasi data lama', startDate: cairoDate(), endDate: ''}));
      t.programSubjects.filter(link => link.programId === program.id && link.active).forEach(link =>
        t.enrollmentSubjects.push(row('enrollmentSubjects', {id: createId('es'), enrollmentId, subjectId: link.subjectId})));
    }
  }
  const adminId = t.users.find(user => ['admin','executive'].includes(user.role)).id;
  for (const old of legacy.videos || []) {
    const program = programFor(old.classLevel);
    t.materials.push(row('materials', {id: old.id, programId: program.id, subjectId: '', teacherId: '',
      title: old.title, description: `${old.description || ''}\nPengajar lama: ${old.teacher || '—'}`,
      videoUrl: old.url || '', pdfUrl: old.pdfUrl || '', quizUrl: old.quizUrl || '', general: true, published: true}));
  }
  for (const old of legacy.announcements || []) t.announcements.push(row('announcements', {
    id: old.id, title: old.title, body: old.body, category: old.category || 'Informasi',
    published: old.published !== false, authorId: adminId, createdAt: old.createdAt || now()
  }));
  for (const [studentId, records] of Object.entries(legacy.learning || {})) {
    if (!t.users.some(user => user.id === studentId)) continue;
    for (const [materialId, entry] of Object.entries(records)) {
      if (t.materials.some(material => material.id === materialId)) t.learning.push(row('learning', {
        id: createId('learning'), studentId, materialId, done: entry.done === true, note: entry.note || ''
      }));
    }
  }
  // Jadwal lama dipertahankan dengan akun guru migrasi nonaktif, untuk ditinjau eksekutif.
  for (const old of legacy.schedules || []) {
    const program = programFor(old.classLevel);
    let subject = t.subjects.find(s => s.name === old.subject);
    if (!subject) { subject = row('subjects', {id: createId('subject'), name: old.subject || 'Materi Umum', description: 'Migrasi'}); t.subjects.push(subject); }
    if (!t.programSubjects.some(p => p.programId === program.id && p.subjectId === subject.id)) t.programSubjects.push(row('programSubjects', {id:createId('ps'), programId:program.id, subjectId:subject.id, active:true}));
    let teacher = t.users.find(u => u.role === 'teacher' && u.name === old.teacher);
    if (!teacher) {
      teacher = row('users', {id:createId('teacher'), nia:'', code:`UST-M${t.users.filter(u => u.role === 'teacher').length + 1}`,
        name:old.teacher || 'Guru Migrasi', email:`${createId('guru')}@markaz.test`, phone:'', domicile:'', password:createId('reset'),
        role:'teacher', status:'suspended', title:'Perlu verifikasi eksekutif'}); t.users.push(teacher);
    }
    let assignment = t.assignments.find(a => a.teacherId === teacher.id && a.programId === program.id && a.subjectId === subject.id);
    if (!assignment) { assignment = row('assignments', {id:createId('assignment'), teacherId:teacher.id, programId:program.id, subjectId:subject.id, active:true}); t.assignments.push(assignment); }
    const startTime = old.time || '16:00', hour = Number(startTime.slice(0,2));
    t.schedules.push(row('schedules', {id:old.id, assignmentId:assignment.id, weekday:(Number(old.day) + 1) % 7,
      startTime, endTime:hour < 23 ? `${String(hour + 1).padStart(2,'0')}:${startTime.slice(3)}` : '23:59', room:old.room || 'Belum ditentukan', active:true}));
  }
  for (const pack of t.packages) {
    const count = t.programSubjects.filter(p => p.programId === pack.programId && p.active).length;
    pack.maxSubjects = count; if (pack.mode === 'all') pack.minSubjects = count;
  }
  db.meta.niaSerial = Math.max(0, ...t.users.filter(u => u.role === 'student').map(u => Number(u.nia.slice(3))));
  db.meta.migratedFrom = sourceKey;
  return db;
}

// Validasi shape, tipe sel, relasi dan kunci unik sebelum commit/import.
export function validateDatabase(db) {
  const fail = message => { throw new Error(`Database tidak valid: ${message}`); };
  if (db?.schemaVersion !== SCHEMA_VERSION || !db.meta || !db.tables) fail('versi/skema');
  if (!Number.isInteger(db.meta.revision) || db.meta.revision < 0 || !Number.isInteger(db.meta.niaSerial) || db.meta.niaSerial < 0 || db.meta.niaSerial > 999) fail('meta');
  const bools = ['isOpen','active','countsForStreak','general','published','done'];
  const numbers = ['weekday','minSubjects','maxSubjects'];
  const ids = {};
  for (const table of TABLE_NAMES) {
    const records = db.tables[table];
    if (!Array.isArray(records) || records.length > 100000) fail(table);
    ids[table] = new Set();
    for (const item of records) {
      if (!item || Object.keys(item).some(key => !TABLE_COLUMNS[table].includes(key))) fail(`${table}: kolom`);
      for (const key of TABLE_COLUMNS[table]) {
        const value = item[key];
        if (bools.includes(key) ? typeof value !== 'boolean' : numbers.includes(key) ? !Number.isInteger(value) : typeof value !== 'string' || value.length > (key === 'videoUrl' ? 20000000 : 100000)) fail(`${table}.${key}`);
      }
      if (!/^[A-Za-z0-9][\w-]{0,119}$/.test(item.id) || ids[table].has(item.id)) fail(`${table}: ID duplikat/tidak sah`);
      if (!item.createdAt || Number.isNaN(Date.parse(item.createdAt)) || !item.updatedAt || Number.isNaN(Date.parse(item.updatedAt))) fail(`${table}: waktu`);
      ids[table].add(item.id);
    }
  }
  const unique = (table, fields, skip = () => false) => {
    const keys = new Set();
    for (const item of db.tables[table]) {
      if (skip(item)) continue;
      const key = JSON.stringify(fields.map(field => String(item[field]).toLowerCase()));
      if (keys.has(key)) fail(`${table}: ${fields.join('+')} duplikat`); keys.add(key);
    }
  };
  const fk = (table, field, target, optional = false) => {
    for (const item of db.tables[table]) if (!(optional && item[field] === '') && !ids[target].has(item[field])) fail(`${table}.${field}: referensi hilang`);
  };
  const refs = [
    ['packages','programId','programs'], ['programSubjects','programId','programs'], ['programSubjects','subjectId','subjects'],
    ['assignments','teacherId','users'], ['assignments','programId','programs'], ['assignments','subjectId','subjects'],
    ['schedules','assignmentId','assignments'], ['enrollments','studentId','users'], ['enrollments','programId','programs'],
    ['enrollments','packageId','packages'], ['enrollments','reviewedBy','users',true],
    ['enrollmentSubjects','enrollmentId','enrollments'], ['enrollmentSubjects','subjectId','subjects'],
    ['attendance','studentId','users'], ['attendance','enrollmentId','enrollments'], ['attendance','subjectId','subjects'], ['attendance','teacherId','users'],
    ['materials','programId','programs',true], ['materials','subjectId','subjects',true], ['materials','teacherId','users',true],
    ['announcements','authorId','users'], ['evaluations','studentId','users'], ['evaluations','teacherId','users'],
    ['evaluations','programId','programs'], ['evaluations','subjectId','subjects'], ['learning','studentId','users'], ['learning','materialId','materials'],
    ['ktaNames','studentId','users'], ['ktaRequests','studentId','users'], ['ktaRequests','nameId','ktaNames',true]
  ];
  refs.forEach(args => fk(...args));
  [['users',['email']], ['users',['nia'],u=>!u.nia], ['users',['code'],u=>!u.code],
    ['programSubjects',['programId','subjectId']], ['assignments',['teacherId','programId','subjectId']],
    ['enrollmentSubjects',['enrollmentId','subjectId']], ['attendance',['studentId','enrollmentId','subjectId','date']],
    ['learning',['studentId','materialId']], ['ktaRequests',['studentId']]].forEach(args => unique(...args));
  const t = db.tables, userById = id => t.users.find(u => u.id === id);
  for (const user of t.users) {
    if (!Object.hasOwn(ROLES,user.role) || !['active','suspended'].includes(user.status) || !user.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email) || !user.password) fail('akun');
    if (user.role === 'student' && (!/^NIA\d{3}$/.test(user.nia) || user.nia === 'NIA000' || Number(user.nia.slice(3)) > db.meta.niaSerial)) fail('NIA');
  }
  if (!t.users.some(u => u.role === 'executive' && u.status === 'active')) fail('perlu eksekutif aktif');
  const belongs = (programId, subjectId) => t.programSubjects.some(p => p.programId === programId && p.subjectId === subjectId);
  for (const p of t.packages) if (!['all','selected'].includes(p.mode) || p.minSubjects < 1 || p.maxSubjects < p.minSubjects) fail('paket');
  for (const a of t.assignments) if (userById(a.teacherId).role !== 'teacher' || !belongs(a.programId,a.subjectId)) fail('penugasan');
  for (const s of t.schedules) if (s.weekday < 0 || s.weekday > 6 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.endTime) || s.endTime <= s.startTime || !s.room.trim()) fail('jadwal');
  for (const e of t.enrollments) {
    if (userById(e.studentId).role !== 'student' || !['pending','active','rejected','expired'].includes(e.status) || t.packages.find(p => p.id === e.packageId).programId !== e.programId) fail('langganan');
    if ((e.startDate && !isDateKey(e.startDate)) || (e.endDate && (!isDateKey(e.endDate) || e.endDate < e.startDate)) || (e.status === 'active' && !e.startDate)) fail('masa langganan');
    const chosen = t.enrollmentSubjects.filter(link => link.enrollmentId === e.id);
    if (!chosen.length || chosen.some(link => !belongs(e.programId,link.subjectId))) fail('madah langganan');
  }
  for (const a of t.attendance) {
    const e = t.enrollments.find(e => e.id === a.enrollmentId);
    if (e.studentId !== a.studentId || !t.enrollmentSubjects.some(s => s.enrollmentId === e.id && s.subjectId === a.subjectId) || userById(a.teacherId).role !== 'teacher' || !isDateKey(a.date) || !['hadir','izin','alpha'].includes(a.status)) fail('absensi');
  }
  for (const m of t.materials) {
    if (!m.title.trim() || (!m.general && (!m.programId || !m.subjectId)) || (m.subjectId && !belongs(m.programId,m.subjectId))) fail('materi');
    if (m.videoUrl && !safeUrl(m.videoUrl) && !/^idb:\/\/[\w-]+$/.test(m.videoUrl) && !/^data:video\/[\w.+-]+;base64,[A-Za-z0-9+/=]+$/.test(m.videoUrl)) fail('URL video');
    for (const field of ['pdfUrl','quizUrl']) if (m[field] && !safeUrl(m[field])) fail(field);
  }
  for (const item of t.learning) if (userById(item.studentId).role !== 'student') fail('pemilik catatan');
  for (const item of t.evaluations) if (userById(item.studentId).role !== 'student' || userById(item.teacherId).role !== 'teacher' || !belongs(item.programId,item.subjectId) || !item.body.trim()) fail('evaluasi');
  for (const n of t.ktaNames) if (userById(n.studentId).role !== 'student' || !n.officialName.trim()) fail('master KTA');
  for (const k of t.ktaRequests) {
    if (!['missing','requested','printing','active'].includes(k.status) || !['self','request','admin'].includes(k.source) || userById(k.studentId).role !== 'student') fail('status KTA');
    if (k.nameId && t.ktaNames.find(n => n.id === k.nameId).studentId !== k.studentId) fail('pemilik nama KTA');
    if (k.gmail && !/^[^\s@]+@gmail\.com$/i.test(k.gmail)) fail('Gmail KTA');
  }
  return db;
}
function parseLocal(key) {
  const raw = localStorage.getItem(key);
  if (raw === null) return null;
  try { return JSON.parse(raw); }
  catch { throw new Error(`Data ${key} rusak. Jangan hapus data situs; gunakan backup.`); }
}
function persist(db) {
  validateDatabase(db);
  try { localStorage.setItem(STORAGE_KEYS.database, JSON.stringify(db)); }
  catch { throw new Error('Gagal menyimpan: penyimpanan browser tidak tersedia atau penuh.'); }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('markaz:data-changed', {detail:{revision:db.meta.revision}}));
  return clone(db);
}
export function initializeDatabase() {
  const existing = parseLocal(STORAGE_KEYS.database);
  if (existing) return validateDatabase(existing);
  let legacy = parseLocal(STORAGE_KEYS.legacyV5), sourceKey = STORAGE_KEYS.legacyV5;
  if (!legacy && localStorage.getItem('mat_users_v4')) {
    sourceKey = 'mat_users_v4';
    legacy = {users:parseLocal(sourceKey), videos:parseLocal('mat_videos_v4') || [], announcements:parseLocal('mat_announcements_v4') || [], schedules:[], learning:{}};
  }
  if (legacy && !Array.isArray(legacy.users)) throw new Error('Format database lama tidak valid.');
  return persist(legacy ? migrateLegacy(legacy,sourceKey) : createSeedDatabase());
}
export const getDatabase = () => initializeDatabase();
export function getTable(name, db = getDatabase()) {
  if (!TABLE_NAMES.includes(name)) throw new Error('Tabel tidak dikenali.');
  return clone(db.tables[name]);
}
export function mutateDatabase(mutator, expectedRevision) {
  const db = getDatabase(), revision = db.meta.revision;
  if (expectedRevision !== undefined && revision !== expectedRevision) throw new Error('Data berubah di tab lain. Muat ulang lalu coba kembali.');
  const result = mutator(db);
  if (result && typeof result.then === 'function') throw new Error('Mutasi database harus sinkron. Simpan Blob lebih dahulu.');
  if (getDatabase().meta.revision !== revision) throw new Error('Konflik perubahan data.');
  db.meta.revision++; db.meta.updatedAt = now();
  return persist(db);
}
export function upsertRow(db, table, data) {
  if (!TABLE_NAMES.includes(table)) throw new Error('Tabel tidak dikenali.');
  const index = db.tables[table].findIndex(item => item.id === data.id);
  const old = index >= 0 ? db.tables[table][index] : {};
  const item = row(table, {...old, ...data, id:data.id || createId(table), createdAt:old.createdAt || data.createdAt || now(), updatedAt:now()});
  if (index < 0) db.tables[table].push(item); else db.tables[table][index] = item;
  return item;
}
export function generateNia(db = getDatabase()) {
  const max = Math.max(db.meta.niaSerial, ...db.tables.users.filter(u => u.role === 'student').map(u => Number(u.nia.slice(3))), 0);
  if (max >= 999) throw new Error('Kapasitas NIA001–NIA999 tercapai.');
  return `NIA${String(max + 1).padStart(3,'0')}`;
}
export function reserveNia(db) {
  const nia = generateNia(db); db.meta.niaSerial = Number(nia.slice(3)); return nia;
}
export function getSession() {
  const session = parseLocal(STORAGE_KEYS.session);
  if (!session?.userId || !session.signedInAt || Number.isNaN(Date.parse(session.signedInAt))) return null;
  const age = Date.now() - Date.parse(session.signedInAt);
  if (age < -60000 || age > 86400000) return null;
  return session;
}
export const clearSession = () => localStorage.removeItem(STORAGE_KEYS.session);
export function currentUser(db = getDatabase()) {
  const session = getSession();
  return db.tables.users.find(u => u.id === session?.userId && u.status === 'active') || null;
}
export function requireRole(...roles) {
  const user = currentUser();
  if (!user || (roles.length && !roles.includes(user.role))) throw new Error('Akses akun tidak diizinkan.');
  return user;
}
export function login(identifier, password) {
  const value = String(identifier).trim().toLowerCase();
  const user = getDatabase().tables.users.find(u => [u.email,u.nia,u.code].filter(Boolean).some(v => v.toLowerCase() === value) && u.password === password);
  if (!user || user.status !== 'active') throw new Error('Email / NIA / kode atau kata sandi tidak sesuai, atau akun nonaktif.');
  localStorage.setItem(STORAGE_KEYS.session,JSON.stringify({userId:user.id,signedInAt:now()}));
  return clone(user);
}
export function getActiveEnrollments(studentId, db = getDatabase(), date = cairoDate()) {
  return db.tables.enrollments.filter(e => e.studentId === studentId && e.status === 'active' && e.startDate <= date && (!e.endDate || e.endDate >= date));
}
export function canTeach(teacherId, programId, subjectId, db = getDatabase()) {
  return db.tables.users.some(u => u.id === teacherId && u.role === 'teacher' && u.status === 'active') && db.tables.assignments.some(a => a.teacherId === teacherId && a.programId === programId && a.subjectId === subjectId && a.active);
}
export function canAccessMaterial(studentId, material, db = getDatabase(), date = cairoDate()) {
  if (!material.published || !db.tables.users.some(u => u.id === studentId && u.role === 'student' && u.status === 'active')) return false;
  return getActiveEnrollments(studentId,db,date).some(e =>
    (!material.programId || material.programId === e.programId) && (material.general || db.tables.enrollmentSubjects.some(s => s.enrollmentId === e.id && s.subjectId === material.subjectId))
  );
}
export function requiredWeekdays(studentId, db = getDatabase(), date = cairoDate()) {
  const result = new Set();
  for (const e of getActiveEnrollments(studentId,db,date)) {
    const pack = db.tables.packages.find(p => p.id === e.packageId);
    if (pack.mode === 'all') { [0,1,2,3,4].forEach(day => result.add(day)); continue; }
    const subjects = db.tables.enrollmentSubjects.filter(s => s.enrollmentId === e.id).map(s => s.subjectId);
    const assignments = db.tables.assignments.filter(a => a.programId === e.programId && subjects.includes(a.subjectId) && a.active && canTeach(a.teacherId,a.programId,a.subjectId,db)).map(a => a.id);
    db.tables.schedules.filter(s => s.active && assignments.includes(s.assignmentId) && !HOLIDAYS.includes(s.weekday)).forEach(s => result.add(s.weekday));
  }
  return [...result].sort();
}

// Semua koneksi ditutup; pemilik URL wajib memanggil release() saat player ditutup.
const VIDEO_DB = 'MarkazVideoVaultDB', VIDEO_STORE = 'videoFiles';
async function videoTransaction(mode, operation) {
  const db = await new Promise((resolve,reject) => {
    let blocked = false;
    const request = indexedDB.open(VIDEO_DB,1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(VIDEO_STORE)) request.result.createObjectStore(VIDEO_STORE); };
    request.onblocked = () => { blocked = true; reject(new Error('Tutup tab portal lain lalu coba kembali.')); };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result); };
  });
  try {
    return await new Promise((resolve,reject) => {
      const tx = db.transaction(VIDEO_STORE,mode); let result;
      const request = operation(tx.objectStore(VIDEO_STORE));
      request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('Transaksi video gagal.'));
    });
  } finally { db.close(); }
}
export const saveLargeVideoFile = (id,blob) => videoTransaction('readwrite',store => store.put(blob,id));
export const getLargeVideoBlob = id => videoTransaction('readonly',store => store.get(id));
export const deleteLargeVideoFile = id => videoTransaction('readwrite',store => store.delete(id));
export async function acquireVideoSource(value) {
  if (!value.startsWith('idb://')) return {url:value, release:() => {}};
  const blob = await getLargeVideoBlob(value.slice(6));
  if (!blob) throw new Error('File lokal tidak ditemukan. Pulihkan backup lengkap atau unggah ulang.');
  const url = URL.createObjectURL(blob); let released = false;
  return {url, release:() => { if (!released) { URL.revokeObjectURL(url); released = true; } }};
}
function blobToDataUrl(blob) {
  return new Promise((resolve,reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
  });
}
export async function createBackup(includeMedia = true) {
  requireRole('executive');
  const database = getDatabase(), media = [], missingMedia = [];
  const ids = [...new Set(database.tables.materials.filter(m => m.videoUrl.startsWith('idb://')).map(m => m.videoUrl.slice(6)))];
  for (const id of ids) {
    if (!includeMedia) { missingMedia.push(id); continue; }
    const blob = await getLargeVideoBlob(id);
    if (blob) media.push({id,data:await blobToDataUrl(blob)}); else missingMedia.push(id);
  }
  return {application:'markaz-at-taallum-lms',version:SCHEMA_VERSION,exportedAt:now(),database,media,missingMedia};
}
export function validateBackup(payload) {
  if (payload?.application !== 'markaz-at-taallum-lms' || payload.version !== SCHEMA_VERSION || !Array.isArray(payload.media)) throw new Error('Backup LMS v6 tidak valid.');
  validateDatabase(payload.database);
  const ids = new Set();
  for (const media of payload.media) {
    if (typeof media.id !== 'string' || !/^[\w-]+$/.test(media.id) || ids.has(media.id) || typeof media.data !== 'string' || !/^data:video\/[\w.+-]+;base64,[A-Za-z0-9+/]*={0,2}$/.test(media.data) || !payload.database.tables.materials.some(m => m.videoUrl === `idb://${media.id}`)) throw new Error('File video pada backup tidak valid.');
    ids.add(media.id);
  }
  return payload.database;
}
export async function restoreBackup(payload) {
  requireRole('executive');
  const database = clone(validateBackup(payload)), previous = getDatabase(), staged = [], mapping = new Map();
  try {
    for (const media of payload.media) {
      const [header,body] = media.data.split(',');
      const blob = new Blob([Uint8Array.from(atob(body),char => char.charCodeAt(0))],{type:header.slice(5,header.indexOf(';'))});
      const id = createId('restored'); await saveLargeVideoFile(id,blob); staged.push(id); mapping.set(media.id,id);
    }
    for (const material of database.tables.materials) if (material.videoUrl.startsWith('idb://')) {
      const oldId = material.videoUrl.slice(6);
      material.videoUrl = `idb://${mapping.get(oldId) || createId('missing')}`;
    }
    requireRole('executive');
    if (getDatabase().meta.revision !== previous.meta.revision) throw new Error('Data berubah selama restore. Ulangi setelah tab lain ditutup.');
    database.meta.revision = previous.meta.revision + 1; database.meta.updatedAt = now();
    persist(database);
  } catch (error) { await Promise.allSettled(staged.map(deleteLargeVideoFile)); throw error; }
  clearSession();
  const oldIds = [...new Set(previous.tables.materials.filter(m => m.videoUrl.startsWith('idb://')).map(m => m.videoUrl.slice(6)))];
  await Promise.allSettled(oldIds.filter(id => !staged.includes(id)).map(deleteLargeVideoFile));
  return clone(database);
}
export function exportSpreadsheetTables() {
  requireRole('admin','executive');
  const db = getDatabase();
  return Object.fromEntries(TABLE_NAMES.map(table => {
    const columns = TABLE_COLUMNS[table].filter(column => column !== 'password');
    return [table,{columns,rows:db.tables[table].map(item => columns.map(column => item[column]))}];
  }));
}
