import { SHEETS_CONFIG } from './sheets-config.js';
import { escapeHtml as esc, currentUser } from './config.js';

let state = {userId:'', token:'', data:null, error:'', loading:false, fetchedAt:0, page:1};
let requestController = null, generation = 0, refreshTimer = null;
const storageKey = id => 'markaz_sheet_access_v1:' + id;
const number = n => new Intl.NumberFormat('id-ID').format(n);
const day = date => date ? new Intl.DateTimeFormat('id-ID', {dateStyle:'medium', timeZone:'Africa/Cairo'}).format(new Date(date + 'T12:00:00Z')) : 'Tanggal belum terbaca';
const empty = message => `<p class="sheets-empty">${esc(message)}</p>`;
const badges = items => items.map(x => `<span class="badge blue">${esc(x)}</span>`).join(' ');
const stat = (label, value, detail) => `<article class="stat-card"><div><span class="stat-label">${esc(label)}</span><strong class="stat-value">${esc(String(value))}</strong><small>${esc(detail)}</small></div></article>`;
export function validEndpoint(url) {
  try { const parsed = new URL(url); return parsed.protocol === 'https:' && parsed.hostname === 'script.google.com' && /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(parsed.pathname) && !parsed.search && !parsed.hash; }
  catch { return false; }
}
function activate(user) {
  if (state.userId === user.id) return;
  requestController?.abort(); generation++;
  let token = ''; try { token = sessionStorage.getItem(storageKey(user.id)) || ''; } catch {}
  state = {userId:user.id,token,data:null,error:'',loading:false,fetchedAt:0,page:1};
}
export function disconnectSheets() {
  requestController?.abort(); generation++;
  try { sessionStorage.removeItem(storageKey(state.userId)); } catch {}
  state = {...state,token:'',data:null,error:'',loading:false,fetchedAt:0,page:1};
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
}
export function sheetsSections(user) {
  activate(user);
  return `<div id="sheets-dashboard">${markup()}</div>`;
}
function markup() {
  const d = state.data, ready = validEndpoint(SHEETS_CONFIG.webAppUrl);
  const sync = d ? new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Cairo'}).format(new Date(d.syncedAt)) : '';
  const status = state.loading ? 'Mengambil data…' : state.error ? 'Pembaruan gagal' : d ? 'Terhubung' : 'Belum terhubung';
  const summary = d?.summary;
  return `<section id="overview" class="panel sheets-connection">
    <div class="panel-head"><div><span class="page-kicker">Ruang belajar · Spreadsheet</span><h2>Perjalanan belajarmu</h2></div><span class="badge ${d && !state.error ? 'active' : 'pending'}" role="status">${esc(status)}</span></div>
    <p class="muted">Profil, program, jadwal, dan absensi dari pengelola Markaz. Waktu lokal Kairo.</p>
    ${!ready ? '<p class="notice-banner orange">Koneksi belum dipasang. Pengelola perlu mengisi URL Web App di <code>sheets-config.js</code>.</p>' : ''}
    ${ready && !state.token ? `<form id="sheet-connect" class="sheets-connect-form"><label for="sheet-token">Kode akses pribadi dari pengelola<input id="sheet-token" type="password" name="token" required minlength="64" maxlength="64" autocomplete="off" spellcheck="false" placeholder="Tempel kode akses santri"></label><button class="btn" type="submit">Hubungkan data saya</button></form><p class="file-note">Kode akses tersimpan selama sesi tab ini. Nama akun website tidak digunakan untuk membuka data santri.</p>` : ''}
    ${state.token ? `<div class="card-actions"><button type="button" class="btn btn-secondary" id="sheet-refresh" ${state.loading ? 'disabled' : ''}>${state.loading ? 'Memuat…' : 'Perbarui data'}</button><button type="button" class="btn btn-secondary" id="sheet-disconnect">Putuskan koneksi</button></div>` : ''}
    ${state.error ? `<p class="form-error show" role="alert">${esc(state.error)}${d ? ' Data di bawah adalah hasil pembaruan sebelumnya.' : ''}</p>` : ''}
    ${d ? `<p class="file-note">Diperbarui ${esc(sync)} Kairo · pembaruan otomatis setiap 2 menit saat halaman aktif.</p><h3>${esc(d.profile.name)}</h3>${d.warnings.map(w => `<p class="file-note">${esc(w)}</p>`).join('')}` : empty(state.loading ? 'Memuat profil dan kehadiran santri…' : 'Hubungkan kode akses untuk menampilkan data santri.')}
    <div class="stats-grid">${stat('Program terdaftar',d ? d.profile.programs.length : '—','Sesuai Database_Murid')}${stat('Maddah diambil',d ? d.profile.subjects.length : '—','Daftar pelajaran santri')}${stat('Kehadiran tercatat',summary?.attendancePercent == null ? '—' : summary.attendancePercent + '%',d ? `${summary.counts.hadir} hadir / ${summary.recognized} catatan berstatus dikenali` : 'Belum ada data')}${stat('Hari hadir',d ? summary.presentDays : '—','Tanggal hadir unik; bukan streak')}</div>
    <p class="file-note">Persentase menghitung Hadir ÷ (Hadir + Izin + Sakit + Alpha). Sesi tanpa catatan tidak otomatis dihitung alpha.</p>
    </section>
    <section id="langganan" class="panel"><div class="panel-head"><h2>Program & maddah saya</h2></div>${d ? `<h3>Program terdaftar</h3><div class="sheets-chips">${d.profile.programs.length ? badges(d.profile.programs) : empty('Program belum diisi pengelola.')}</div><h3>Maddah diambil</h3><div class="sheets-chips">${d.profile.subjects.length ? badges(d.profile.subjects) : empty('Maddah belum diisi pengelola.')}</div><p class="file-note">Daftar maddah gabungan untuk semua program. Spreadsheet belum menyimpan status pembayaran, tanggal aktif, atau rincian paket.</p>` : empty('Data program akan muncul setelah terhubung.')}</section>
    <section id="jadwal" class="panel"><div class="panel-head"><div><h2>Jadwal kelas</h2><p class="muted">Hari ini dan mendatang · sesuai program serta maddah yang diambil.</p></div></div>${scheduleMarkup(d)}</section>
    <section id="riwayat" class="panel"><div class="panel-head"><div><h2>Riwayat kehadiran</h2><p class="muted">Log absensi dipadankan dengan sesi kelas.</p></div></div>${attendanceMarkup(d)}</section>`;
}
function scheduleMarkup(d) {
  if (!d) return empty('Hubungkan data untuk melihat jadwal.');
  if (!d.schedule.length) return empty('Belum ada jadwal hari ini atau mendatang yang cocok di spreadsheet.');
  return `<div class="schedule-grid">${d.schedule.map(r => `<article class="schedule-card"><div class="schedule-time"><strong>${esc(day(r.date))}</strong><span>${esc(r.time || 'Jam belum diisi')}</span><small>Waktu Kairo</small></div><div>${badges([r.program])}<h3>${esc(r.subject)}</h3><p>${esc(r.teacher || 'Pengajar belum diisi')}<br>Ruangan: ${esc(r.room || 'Belum diisi')}</p>${r.classStatus ? `<span class="badge blue">${esc(r.classStatus)}</span>` : ''}<small class="sheets-source">Sumber: ${esc(r.source)}</small></div></article>`).join('')}</div>`;
}
function attendanceMarkup(d) {
  if (!d) return empty('Hubungkan data untuk melihat riwayat kehadiran.');
  if (!d.attendance.length) return empty('Belum ada catatan absensi untuk santri ini.');
  const pages = Math.ceil(d.attendance.length / 20); state.page = Math.min(state.page, pages);
  const rows = d.attendance.slice((state.page - 1)*20, state.page*20);
  const summaries = Object.entries(d.summary.counts).map(([label,count]) => `<span class="badge blue">${esc(label)}: ${number(count)}</span>`).join(' ');
  return `<div class="sheets-chips">${summaries}</div><div class="table-wrap"><table><caption>Riwayat absensi santri · ${number(d.attendance.length)} catatan</caption><thead><tr><th>Tanggal</th><th>Maddah / program</th><th>Pengajar</th><th>Kehadiran</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(day(r.date))}</td><td><strong>${esc(r.subject || 'Sesi belum ditemukan')}</strong><br><small>${esc(r.program || '—')}</small></td><td>${esc(r.teacher || '—')}</td><td><span class="badge ${r.status === 'hadir' ? 'active' : 'pending'}">${esc(r.statusLabel)}</span></td></tr>`).join('')}</tbody></table></div><div class="card-actions sheets-pages"><button class="btn btn-secondary btn-sm" id="sheet-prev" ${state.page === 1 ? 'disabled' : ''}>Sebelumnya</button><span>Halaman ${state.page} / ${pages}</span><button class="btn btn-secondary btn-sm" id="sheet-next" ${state.page === pages ? 'disabled' : ''}>Berikutnya</button></div>
    <details><summary>Rekap per maddah</summary><div class="table-wrap"><table><thead><tr><th>Program</th><th>Maddah</th><th>Hadir</th><th>Catatan</th></tr></thead><tbody>${d.bySubject.map(r => `<tr><td>${esc(r.program || '—')}</td><td>${esc(r.subject || 'Sesi belum ditemukan')}</td><td>${number(r.hadir)}</td><td>${number(r.total)}</td></tr>`).join('')}</tbody></table></div></details>`;
}
function paint() {
  if (currentUser()?.id !== state.userId) { disconnectSheets(); return; }
  const root = document.getElementById('sheets-dashboard');
  if (!root) return;
  root.innerHTML = markup(); bind();
}
function bind() {
  document.getElementById('sheet-connect')?.addEventListener('submit', event => {
    event.preventDefault();
    const token = new FormData(event.currentTarget).get('token').trim();
    if (!/^[a-f0-9]{64}$/.test(token)) { state.error = 'Kode akses harus terdiri dari 64 karakter. Salin ulang kode dari pengelola.'; paint(); return; }
    state.token = token; state.data = null; state.page = 1; load();
  });
  document.getElementById('sheet-refresh')?.addEventListener('click', () => load());
  document.getElementById('sheet-disconnect')?.addEventListener('click', () => { disconnectSheets(); paint(); });
  document.getElementById('sheet-prev')?.addEventListener('click', () => { state.page--; paint(); document.getElementById('riwayat')?.scrollIntoView({block:'start'}); });
  document.getElementById('sheet-next')?.addEventListener('click', () => { state.page++; paint(); document.getElementById('riwayat')?.scrollIntoView({block:'start'}); });
}
export async function fetchDashboard(token, signal, endpoint = SHEETS_CONFIG.webAppUrl) {
  if (!validEndpoint(endpoint)) throw new Error('URL Web App belum valid. Hubungi pengelola.');
  const response = await fetch(endpoint, {
    method:'POST', redirect:'follow', credentials:'omit', cache:'no-store', signal,
    // text/plain menghindari preflight OPTIONS yang tidak didukung Apps Script.
    headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify({action:'dashboard', token})
  });
  if (!response.ok) throw new Error('Server belum dapat diakses. Periksa deployment Web App.');
  let result;
  try { result = await response.json(); }
  catch { throw new Error('Respons bukan JSON. Pastikan URL /exec dan akses deployment Anyone.'); }
  if (!result.ok) { const error = new Error(result.error?.message || 'Data belum dapat dibaca.'); error.code = result.error?.code; throw error; }
  const d = result.data;
  if (!d || typeof d.profile?.name !== 'string' || !Array.isArray(d.profile.programs) || !Array.isArray(d.profile.subjects)
    || !Array.isArray(d.schedule) || !Array.isArray(d.attendance) || !Array.isArray(d.bySubject) || !Array.isArray(d.warnings)
    || !d.summary?.counts || !Number.isFinite(Date.parse(d.syncedAt))) throw new Error('Format respons tidak sesuai. Perbarui deployment Apps Script.');
  return d;
}
async function load() {
  if (state.loading || !state.token || !validEndpoint(SHEETS_CONFIG.webAppUrl)) return;
  const ticket = ++generation, userId = state.userId;
  const controller = new AbortController(); requestController = controller;
  const timeout = setTimeout(() => controller.abort(), SHEETS_CONFIG.timeoutMs);
  state.loading = true; state.error = ''; paint();
  try {
    const data = await fetchDashboard(state.token, controller.signal);
    if (generation !== ticket || currentUser()?.id !== userId) return;
    state.data = data; state.fetchedAt = Date.now();
    try { sessionStorage.setItem(storageKey(userId), state.token); } catch {}
    startTimer();
  } catch(error) {
    if (generation !== ticket || currentUser()?.id !== userId) return;
    if (error.code === 'UNAUTHORIZED' || error.code === 'IDENTITY_ERROR') {
      state.token = ''; state.data = null;
      try { sessionStorage.removeItem(storageKey(userId)); } catch {}
    }
    state.error = error.name === 'AbortError' ? 'Waktu koneksi habis. Tekan Perbarui data untuk mencoba lagi.'
      : error instanceof TypeError ? 'Koneksi gagal. Periksa internet dan akses deployment Apps Script.' : error.message;
  } finally {
    clearTimeout(timeout);
    if (ticket === generation) { state.loading = false; paint(); }
  }
}
function startTimer() {
  if (refreshTimer) return;
  refreshTimer = setInterval(() => {
    if (currentUser()?.id !== state.userId) { disconnectSheets(); return; }
    if (document.visibilityState === 'visible' && document.getElementById('sheets-dashboard') && state.token) load();
  }, SHEETS_CONFIG.refreshMs);
}
export function mountSheets(user) {
  activate(user); bind(); startTimer();
  if (state.token && !state.loading && (!state.data || Date.now() - state.fetchedAt > SHEETS_CONFIG.refreshMs)) load();
}
