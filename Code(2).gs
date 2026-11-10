/** Markaz — API baca dashboard. Pasang di proyek Apps Script BARU.
 * Tidak mengubah spreadsheet dan tidak membaca Trigger_Jadwal/Data_Master.
 * Identitas ditentukan kode akses server, bukan nama/NIA kiriman browser.
 */
const MARKAZ_SHEET_ID = '1BbtSL6sF5inDOvtDHGIHiBeBm-chr1ZbURSW3OKIlcQ';
const MARKAZ_TZ = 'Africa/Cairo';
const ACCESS_PREFIX = 'STUDENT_ACCESS_';

function doGet() {
  return json_({ok: true, service: 'Markaz Student Dashboard', version: 1,
    message: 'Gunakan POST dengan action dashboard dan token pribadi.'});
}
function doPost(e) {
  try {
    const body = JSON.parse(e && e.postData && e.postData.contents || '{}');
    if (body.action !== 'dashboard') fail_('BAD_REQUEST', 'Permintaan tidak dikenali.');
    const identity = authenticate_(body.token);
    const book = SpreadsheetApp.openById(MARKAZ_SHEET_ID);
    const student = findStudent_(book, identity.name);
    const warnings = [];
    const sessions = rows_(book, 'Sesi_Kelas', ['Tanggal','Pengajar','Maddah','Kelas','ID_Sesi','Status_Kelas']);
    const logs = rows_(book, 'Log_Absensi', ['Nama_Murid','Status_Kehadiran','Waktu_Scan','ID_Absen','ID_Sesi']);
    const imports = optionalRows_(book, 'Sumber_Import', warnings);
    const tomorrow = optionalRows_(book, 'Jadwal_Besok', warnings);
    const today = Utilities.formatDate(new Date(), MARKAZ_TZ, 'yyyy-MM-dd');
    const data = dashboard_(student, sessions, logs, imports, tomorrow, today);
    data.warnings = warnings.concat(data.warnings);
    data.syncedAt = new Date().toISOString();
    data.timezone = MARKAZ_TZ;
    return json_({ok: true, data: data});
  } catch (error) {
    // Jangan mengirim stack, token, isi sheet, atau nama santri lain.
    return json_({ok: false, error: {code: error.publicCode || 'SERVER_ERROR',
      message: error.publicCode ? error.message : 'Data belum dapat dibaca. Hubungi pengelola.'}});
  }
}
function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
function fail_(code, message) { const e = new Error(message); e.publicCode = code; throw e; }
function clean_(v) { return String(v == null ? '' : v).normalize('NFKC').replace(/[\u200B-\u200D\uFEFF\u2060]/g, '').trim().replace(/\s+/g, ' '); }
function key_(v) { return clean_(v).toLowerCase(); }
function list_(v) {
  const result = new Map();
  String(v || '').split(/[,;\n]/).forEach(s => { if (clean_(s)) result.set(key_(s), clean_(s)); });
  return Array.from(result.values());
}
function hash_(token) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token, Utilities.Charset.UTF_8)
    .map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}
function authenticate_(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) fail_('UNAUTHORIZED', 'Kode akses tidak valid atau sudah dicabut.');
  const raw = PropertiesService.getScriptProperties().getProperty(ACCESS_PREFIX + hash_(token));
  if (!raw) fail_('UNAUTHORIZED', 'Kode akses tidak valid atau sudah dicabut.');
  const identity = JSON.parse(raw);
  if (!identity.name || !identity.expiresAt || new Date(identity.expiresAt).getTime() <= Date.now())
    fail_('UNAUTHORIZED', 'Kode akses kedaluwarsa. Minta kode baru kepada pengelola.');
  return identity;
}
function rows_(book, title, required) {
  const sheet = book.getSheetByName(title);
  if (!sheet) fail_('SCHEMA_ERROR', 'Tab ' + title + ' tidak ditemukan.');
  const width = sheet.getLastColumn(), height = sheet.getLastRow();
  if (!width || !height) fail_('SCHEMA_ERROR', 'Header tab ' + title + ' belum diisi.');
  const headers = sheet.getRange(1, 1, 1, width).getDisplayValues()[0].map(clean_);
  const indexes = required.map(h => {
    if (headers.filter(x => x === h).length !== 1) fail_('SCHEMA_ERROR', 'Periksa kolom ' + h + ' pada tab ' + title + '.');
    return headers.indexOf(h);
  });
  if (height === 1) return [];
  // Hanya ambil sampai kolom yang diperlukan; jangan kirim data mentah ke browser.
  return sheet.getRange(2, 1, height - 1, Math.max.apply(null, indexes) + 1).getValues()
    .map(values => Object.fromEntries(required.map((h, i) => [h, values[indexes[i]]])))
    .filter(row => required.some(h => row[h] !== '' && row[h] != null));
}
function optionalRows_(book, title, warnings) {
  if (!book.getSheetByName(title)) { warnings.push('Sumber jadwal ' + title + ' belum tersedia.'); return []; }
  return rows_(book, title, ['TANGGAL','HARI','JAM','RUANGAN','GURU','PROGRAM','MADDAH']);
}
function findStudent_(book, name) {
  const matches = rows_(book, 'Database_Murid', ['Nama_Murid','Program','Maddah_Diambil'])
    .filter(r => key_(r.Nama_Murid) === key_(name));
  if (matches.length !== 1) fail_('IDENTITY_ERROR', 'Nama santri belum cocok atau ganda di Database_Murid. Hubungi pengelola.');
  return matches[0];
}
function dateKey_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v, MARKAZ_TZ, 'yyyy-MM-dd');
  const s = clean_(v); let m, y, month, d;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/))) { y = +m[1]; month = +m[2]; d = +m[3]; }
  else if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:\s.*)?$/))) { d = +m[1]; month = +m[2]; y = +m[3]; }
  else if ((m = s.match(/^(\d{1,2})[-\s]([A-Za-z]+)[-\s](\d{4})$/))) {
    const months = {jan:1,feb:2,mar:3,apr:4,may:5,mei:5,jun:6,jul:7,aug:8,agu:8,agt:8,sep:9,oct:10,okt:10,nov:11,dec:12,des:12};
    d = +m[1]; month = months[m[2].toLowerCase().slice(0,3)]; y = +m[3];
  } else return '';
  const check = new Date(Date.UTC(y, month - 1, d));
  return check.getUTCFullYear() === y && check.getUTCMonth() === month - 1 && check.getUTCDate() === d
    ? y + '-' + String(month).padStart(2,'0') + '-' + String(d).padStart(2,'0') : '';
}
function status_(v) {
  const s = key_(v);
  return ({hadir:'hadir',izin:'izin',ijin:'izin',sakit:'sakit',alpha:'alpha',alpa:'alpha',alfa:'alpha','tidak hadir':'alpha'})[s] || 'lainnya';
}
function slotKey_(r) { return [r.date, r.program, r.subject, r.teacher].map(key_).join('|'); }
function dashboard_(student, sessions, logs, imports, tomorrow, today) {
  const name = clean_(student.Nama_Murid), programs = list_(student.Program), subjects = list_(student.Maddah_Diambil);
  const programKeys = new Set(programs.map(key_)), subjectKeys = new Set(subjects.map(key_));
  const warnings = [];
  if (!programs.length || !subjects.length) warnings.push('Program atau maddah belum lengkap. Jadwal belum dapat dicocokkan.');
  const sessionById = new Map(), sessionBySlot = new Map();
  sessions.forEach(r => {
    const id = clean_(r.ID_Sesi);
    const s = {sessionId:id, date:dateKey_(r.Tanggal), program:clean_(r.Kelas),
      subject:clean_(r.Maddah), teacher:clean_(r.Pengajar), classStatus:clean_(r.Status_Kelas)};
    if (id) sessionById.set(id, s);
    if (s.date) sessionBySlot.set(slotKey_(s), s);
  });
  const attendanceById = new Map();
  let missingDates = 0, missingSessions = 0;
  logs.forEach((r, index) => {
    if (key_(r.Nama_Murid) !== key_(name)) return;
    const sessionId = clean_(r.ID_Sesi), session = sessionById.get(sessionId);
    const date = session && session.date || dateKey_(r.Waktu_Scan);
    if (!date) missingDates++;
    if (!session) missingSessions++;
    const record = {id: clean_(r.ID_Absen) || sessionId || 'row-' + index,
      sessionId:sessionId, date:date, status:status_(r.Status_Kehadiran), statusLabel:clean_(r.Status_Kehadiran) || 'Belum diisi',
      subject: session ? session.subject : '', program: session ? session.program : '',
      teacher: session ? session.teacher : '', classStatus:session ? session.classStatus : '',
      sessionMissing: !session};
    // Koreksi terbaru (baris terakhir) menang; satu santri dihitung sekali per ID_Sesi.
    attendanceById.set(sessionId || record.id, record);
  });
  const attendance = Array.from(attendanceById.values()).sort((a,b) => b.date.localeCompare(a.date) || a.subject.localeCompare(b.subject));
  const counts = {hadir:0,izin:0,sakit:0,alpha:0,lainnya:0};
  attendance.forEach(r => counts[r.status]++);
  const recognized = counts.hadir + counts.izin + counts.sakit + counts.alpha;
  const presentDays = new Set(attendance.filter(r => r.status === 'hadir' && r.date).map(r => r.date)).size;
  const scheduleByKey = new Map();
  let invalidScheduleDates = 0;
  function addSchedule(rows, source) {
    rows.forEach(r => {
      if (!programKeys.has(key_(r.PROGRAM)) || !subjectKeys.has(key_(r.MADDAH))) return;
      const date = dateKey_(r.TANGGAL);
      if (!date) { invalidScheduleDates++; return; }
      if (date < today) return;
      const row = {date:date, time:clean_(r.JAM), room:clean_(r.RUANGAN), teacher:clean_(r.GURU),
        program:clean_(r.PROGRAM), subject:clean_(r.MADDAH), source:source};
      const session = sessionBySlot.get(slotKey_(row));
      row.classStatus = session ? session.classStatus : '';
      // Hapus salinan persis; waktu berbeda tetap dianggap sesi berbeda.
      scheduleByKey.set(slotKey_(row) + '|' + key_(row.time) + '|' + key_(row.room), row);
    });
  }
  addSchedule(imports, 'Sumber_Import'); addSchedule(tomorrow, 'Jadwal_Besok');
  const schedule = Array.from(scheduleByKey.values()).sort((a,b) => a.date.localeCompare(b.date) || timeSort_(a.time) - timeSort_(b.time));
  if (missingSessions) warnings.push('Ada absensi yang ID_Sesi-nya belum ditemukan. Detail kelas ditampilkan kosong.');
  if (missingDates) warnings.push('Ada tanggal absensi yang tidak terbaca. Catatan tetap ditampilkan.');
  if (invalidScheduleDates) warnings.push('Ada tanggal jadwal yang tidak terbaca dan belum ditampilkan.');
  const bySubject = new Map();
  attendance.forEach(r => {
    const k = key_(r.program) + '|' + key_(r.subject);
    if (!bySubject.has(k)) bySubject.set(k, {program:r.program,subject:r.subject,hadir:0,total:0});
    const stat = bySubject.get(k); stat.total++; if (r.status === 'hadir') stat.hadir++;
  });
  return {profile:{name:name,programs:programs,subjects:subjects}, today:today, attendance:attendance,
    summary:{counts:counts,total:attendance.length,recognized:recognized,presentDays:presentDays,
      attendancePercent:recognized ? Math.round(counts.hadir / recognized * 100) : null},
    bySubject:Array.from(bySubject.values()), schedule:schedule, warnings:warnings};
}
function timeSort_(v) { const m = String(v).match(/(\d{1,2})[.:](\d{2})/); return m ? +m[1]*60 + +m[2] : 9999; }

// Jalankan dari editor, bukan dari browser. Isi Script Property ISSUE_STUDENT_NAME.
function createStudentAccess() {
  const props = PropertiesService.getScriptProperties();
  const name = props.getProperty('ISSUE_STUDENT_NAME');
  if (!name) throw new Error('Isi Script Property ISSUE_STUDENT_NAME dengan Nama_Murid persis dari sheet.');
  const student = findStudent_(SpreadsheetApp.openById(MARKAZ_SHEET_ID), name);
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toLowerCase();
  const canonicalName = clean_(student.Nama_Murid);
  // Penerbitan ulang membatalkan kode lama untuk nama yang sama.
  revokeByName_(props, canonicalName);
  props.setProperty(ACCESS_PREFIX + hash_(token), JSON.stringify({name:canonicalName,
    expiresAt:new Date(Date.now() + 90*24*60*60*1000).toISOString()}));
  console.log('Kode akses pribadi (berlaku 90 hari; berikan hanya ke santri bersangkutan): ' + token);
}
function revokeStudentAccess() {
  const props = PropertiesService.getScriptProperties(), name = props.getProperty('ISSUE_STUDENT_NAME');
  if (!name) throw new Error('Isi ISSUE_STUDENT_NAME terlebih dahulu.');
  revokeByName_(props, name);
  console.log('Kode akses santri telah dicabut.');
}
function revokeByName_(props, name) {
  const all = props.getProperties();
  Object.keys(all).filter(k => k.indexOf(ACCESS_PREFIX) === 0).forEach(k => {
    if (key_(JSON.parse(all[k]).name) === key_(name)) props.deleteProperty(k);
  });
}
