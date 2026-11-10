# Student Dashboard Markaz — integrasi Google Sheets

Kode sudah disesuaikan dengan struktur spreadsheet **Absensi Harian** yang diperiksa pada 10 November 2026. Koneksi live belum diaktifkan: pemilik spreadsheet perlu memasang Apps Script, membuat kode akses santri, dan mengisi URL deployment.

Spreadsheet sumber: https://docs.google.com/spreadsheets/d/1BbtSL6sF5inDOvtDHGIHiBeBm-chr1ZbURSW3OKIlcQ/edit

## 1. File yang dipakai

Paket ini berangkat dari proyek `m2.zip`; `student-dash.html` di dalamnya cocok dengan HTML yang dikirim. Halaman index, dashboard guru/admin/eksekutif, serta data lokal tetap disertakan.

| File | Kegunaan |
| --- | --- |
| `student-dash.html` | Halaman student dashboard yang memanggil aplikasi dan CSS tambahan |
| `app.js` | Dashboard lama yang sudah dipasang integrasi spreadsheet |
| `student-sheets.js` | JavaScript frontend: mengambil data, menampilkan profil/jadwal/absensi, menangani gagal koneksi |
| `sheets-config.js` | Tempat menempel URL Web App Apps Script |
| `student-sheets.css` | Gaya tampilan panel spreadsheet yang mengikuti desain lama |
| `apps-script/Code.gs` | JavaScript backend untuk ditempel di editor Apps Script |
| `apps-script/appsscript.json` | Manifest Apps Script dengan zona waktu Kairo dan akses spreadsheet hanya-baca |
| `tests/` | Pengujian logika aplikasi dan integrasi |

**Jangan hanya mengganti HTML.** Untuk memasang ke proyek yang sama, ganti `app.js` dan `student-dash.html`, lalu tambahkan `student-sheets.js`, `sheets-config.js`, dan `student-sheets.css` dalam folder yang sama dengan `config.js` dan `styles.css`. Semua dependensi tersedia dalam ZIP. Buat salinan proyek lama sebelum mengganti file jika ada revisi lain yang belum masuk paket ini.

File tes bawaan yang sebelumnya berada di root dirapikan ke folder `tests/` agar perintah `npm test` cocok dengan impor relatifnya.

## 2. Pemetaan data yang sudah diterapkan

| Tab / kolom | Yang muncul di dashboard |
| --- | --- |
| `Database_Murid.Nama_Murid` | Nama santri dari spreadsheet |
| `Database_Murid.Program` | Daftar program santri, termasuk beberapa program dalam satu sel |
| `Database_Murid.Maddah_Diambil` | Daftar maddah gabungan yang diambil |
| `Sumber_Import`: TANGGAL, JAM, RUANGAN, GURU, PROGRAM, MADDAH | Jadwal hari ini dan mendatang |
| `Jadwal_Besok`: kolom yang sama | Jadwal tambahan; salinan yang persis sama ditampilkan sekali |
| `Sesi_Kelas`: Tanggal, Pengajar, Maddah, Kelas, ID_Sesi, Status_Kelas | Detail kelas untuk absensi, serta status kelas bila cocok dengan jadwal |
| `Log_Absensi`: Nama_Murid, Status_Kehadiran, Waktu_Scan, ID_Absen, ID_Sesi | Riwayat, rekap Hadir/Izin/Sakit/Alpha/lainnya, persentase, dan rekap per maddah |

`Data_Master` tidak perlu ditampilkan sebagai daftar program milik santri. Daftar kepemilikan program diambil langsung dari `Database_Murid`. API tidak membaca `Trigger_Jadwal` dan tidak mengirim nomor WhatsApp orang tua, password, atau daftar santri lain.

Materi/video/PDF, pembayaran, masa aktif paket, status KTA, pengumuman, dan mutaba’ah belum tersedia pada tab sumber yang diperiksa. Bagian materi, KTA, mutaba’ah, dan kabar lama tetap ditampilkan dengan keterangan bahwa datanya masih lokal. Daftar program dari spreadsheet **tidak** otomatis membuktikan pembayaran atau membuka materi berbayar lokal.

## 3. Pasang backend Google Apps Script

Gunakan akun Google yang bisa membaca spreadsheet sumber.

1. Buka https://script.google.com/ lalu buat **New project / Proyek baru**. Beri nama `Markaz Student Dashboard API`.
2. Buka file `Code.gs`. Ganti isi default dengan seluruh isi `apps-script/Code.gs` dari paket ini.
3. ID spreadsheet sudah ditulis dalam konstanta `MARKAZ_SHEET_ID`. Untuk link yang kamu berikan, tidak perlu mengubahnya. ID adalah bagian di antara `/d/` dan `/edit`, bukan seluruh URL.
4. Buka **Project Settings / Setelan proyek**. Aktifkan **Show appsscript.json manifest file in editor**.
5. Kembali ke editor, buka `appsscript.json`, lalu salin isi `apps-script/appsscript.json` dari paket ini. Manifest memakai zona waktu `Africa/Cairo` dan izin baca spreadsheet.
6. Simpan semua file.

Proyek Apps Script terpisah dipilih karena spreadsheet sudah mempunyai alur absensi dan jadwal. Jangan menimpa `doGet`, `doPost`, atau fungsi otomatisasi pada proyek absensi lama. Kedua proyek tetap bisa membaca spreadsheet yang sama.

## 4. Buat kode akses santri

Spreadsheet saat ini tidak menyediakan email login/NIA unik untuk menghubungkan akun website dengan identitas server. Karena itu integrasi menggunakan kode akses pribadi per santri. Login lama website tetap lokal; nama akun atau NIA kiriman browser bukan bukti identitas untuk API ini.

1. Pada proyek Apps Script baru, buka **Project Settings → Script properties → Add script property**.
2. Isi **Property** dengan `ISSUE_STUDENT_NAME`.
3. Isi **Value** dengan nama lengkap yang disalin dari `Database_Murid`, kolom `Nama_Murid`. Simpan.
4. Kembali ke editor. Pilih fungsi **createStudentAccess** dari daftar fungsi, lalu klik **Run / Jalankan**.
5. Jika diminta, tinjau dan izinkan akses baca spreadsheet untuk proyek yang baru dibuat ini.
6. Buka **Execution log**. Salin kode akses 64 karakter yang muncul. Berikan hanya kepada santri yang bersangkutan; jangan menempelkan kode akses ke file JavaScript publik atau spreadsheet yang dibagikan umum.
7. Untuk santri berikutnya, ubah nilai `ISSUE_STUDENT_NAME` lalu jalankan lagi.

Kode berlaku 90 hari. Menjalankan `createStudentAccess` lagi untuk nama yang sama mencabut kode lama. Untuk mencabut tanpa membuat pengganti, isi nama pada `ISSUE_STUDENT_NAME` lalu jalankan **revokeStudentAccess**. Tidak perlu deployment baru setiap kali menerbitkan atau mencabut kode karena pemetaannya disimpan pada Script Properties.

Satu nama harus mengacu ke satu baris santri. Bila ada dua orang bernama sama, API menolak pencocokan sampai data diberi identitas yang unik; jangan menggabungkan orang yang berbeda. Jika nama resmi berubah, perbarui nama pada log yang terkait dan terbitkan ulang kode. Pencocokan mengabaikan kapitalisasi, spasi berlebih, dan karakter tak terlihat; nomor urut atau perbedaan ejaan tetap harus dibenahi oleh pengelola.

## 5. Deploy Web App

1. Klik **Deploy → New deployment**.
2. Pilih jenis **Web app**.
3. **Execute as:** pilih **Me / Saya**, yaitu pemilik script yang memiliki akses spreadsheet.
4. **Who has access:** pilih **Anyone / Siapa saja**, agar frontend website bisa memanggil endpoint tanpa halaman login Google. Data santri tetap memerlukan kode akses valid yang diperiksa server.
5. Klik **Deploy**, lalu salin **Web app URL** yang berakhiran `/exec`.

Jangan memakai URL `/dev`, link editor Apps Script, link spreadsheet, atau URL redirect `script.googleusercontent.com`. Spreadsheet tidak perlu dipublikasikan ke web atau diubah menjadi akses umum. Jika akun organisasi tidak mengizinkan deployment Anyone, pengaturan integrasi browser ini membutuhkan bantuan admin Google Workspace atau backend/proxy berautentikasi.

## 6. Hubungkan website

Buka `sheets-config.js`, isi `webAppUrl`:

```js
export const SHEETS_CONFIG = Object.freeze({
  webAppUrl: 'https://script.google.com/macros/s/ID_DEPLOYMENT_KAMU/exec',
  timeoutMs: 30000,
  refreshMs: 120000
});
```

URL tersebut adalah URL yang kamu salin dari hasil deployment, bukan contoh di atas.

Jalankan website melalui Preview Server SPCK atau hosting HTTPS. ES Modules tidak cocok dibuka langsung sebagai `file://` dari pengelola berkas. Di komputer, bisa menggunakan `python3 -m http.server 8080` dari folder proyek dan membuka `http://localhost:8080/login.html`.

Masuk ke akun santri → buka student dashboard → tempel kode akses → klik **Hubungkan data saya**. Profil spreadsheet akan ditampilkan dalam panel tersendiri. Nama di sapaan/sidebar tetap nama akun website lama. Kode tersimpan dalam `sessionStorage` per akun selama sesi tab, dihapus saat logout atau **Putuskan koneksi**. Respons absensi tidak ditulis ke database lokal. Masuk ulang pada perangkat lain membutuhkan kode akses.

## 7. Cara kerja pembacaan

- Frontend mengirim POST ke Web App dengan `action: 'dashboard'` dan `token` di body. Browser tidak mengirim nama santri untuk memilih data.
- Backend memeriksa hash kode akses pada Script Properties, kemudian mencari santri yang diizinkan.
- Header dibaca berdasarkan nama kolom, sehingga urutan kolom boleh berubah. Nama tab dan header wajib tetap sesuai tabel di atas. Baris pertama harus header.
- Program/maddah majemuk dipisahkan berdasarkan koma, titik koma, atau baris baru. Jadwal harus cocok dengan salah satu program **dan** salah satu maddah santri. Karena sheet belum menyimpan relasi program–maddah per santri, daftar maddah dianggap gabungan.
- Tanggal memakai waktu Kairo. Format tanggal Google Sheets asli, `dd/MM/yyyy`, `dd-MMM-yyyy`, dan `yyyy-MM-dd` didukung. Hari kelas diambil dari tanggal, bukan aturan libur lokal pada aplikasi lama.
- Absensi dipadankan melalui `ID_Sesi`. Riwayat lama tetap muncul meskipun program santri saat ini sudah berubah.
- Jika ada koreksi berulang untuk sesi yang sama, baris terakhir di `Log_Absensi` menang. Perbedaan waktu scan tidak dipakai untuk memilih koreksi. Satu santri dihitung sekali per sesi.
- Tanpa baris absensi, sistem tidak membuat status Alpha. Persentase = Hadir / (Hadir + Izin + Sakit + Alpha) × 100. Status lain tetap terlihat tetapi tidak masuk penyebut. Nilai kosong ditampilkan `—`, bukan 0%.
- **Hari hadir** adalah jumlah tanggal hadir unik, bukan streak berturut-turut. Papan peringkat/streak lokal diganti karena sumber belum memberi aturan historis yang cukup untuk menghitung streak yang sahih.
- Dua baris jadwal dengan tanggal, program, maddah, guru, jam, dan ruangan sama digabung; sumber `Jadwal_Besok` diutamakan untuk salinan persis. Jika jadwal dipindahkan jam/ruangan, hapus atau perbarui jadwal lama pada sumber agar tidak muncul dua sesi. ID sesi tidak tersedia di kedua tab jadwal, sehingga perubahan jam tidak bisa dianggap koreksi secara otomatis.
- Tidak ada penulisan balik absensi dari dashboard ini. Koreksi dilakukan pada spreadsheet oleh pengelola.

Data dibaca saat terhubung, ketika tombol **Perbarui data** ditekan, dan setiap dua menit saat halaman aktif. Tidak diperlukan trigger Apps Script untuk pembacaan ini. Tampilan bisa tertinggal sampai pembaruan berikutnya. Saat koneksi gagal, data terakhir diberi penanda kegagalan; saat kode dicabut, panel pribadi dikosongkan pada permintaan berikutnya.

## 8. Cek setelah pemasangan

1. Buka URL `/exec`: harus muncul JSON berisi nama layanan, tanpa data santri. Ini hanya memeriksa endpoint, belum menguji izin baca spreadsheet.
2. Hubungkan satu kode akses pada dashboard. Cocokkan nama, program, dan maddah dengan satu baris `Database_Murid`.
3. Cocokkan satu riwayat absensi dengan `Log_Absensi` dan `Sesi_Kelas`, termasuk nama guru dan tanggal.
4. Cocokkan satu jadwal yang program dan maddahnya memang diambil santri.
5. Ubah satu data yang memang ingin diperbarui di sheet, lalu tekan **Perbarui data**. Tidak perlu redeploy jika hanya isi spreadsheet berubah.
6. Uji kode salah: profil dan riwayat tidak boleh terbuka.
7. Jika isi `Code.gs` diubah, buka **Deploy → Manage deployments → Edit → New version → Deploy**. Dengan mengedit deployment yang sama, URL biasanya tetap; jika membuat deployment baru, ganti URL frontend.

## 9. Jika data belum muncul

| Gejala | Yang diperiksa |
| --- | --- |
| Koneksi belum dipasang | Isi `webAppUrl` pada `sheets-config.js` |
| Respons bukan JSON / halaman login | URL `/exec`, Execute as Me, dan akses Anyone |
| Gagal koneksi / CORS | Hosting/preview mengizinkan `script.google.com` dan `script.googleusercontent.com`; CSP `connect-src` harus mengizinkan keduanya jika ada CSP; akses deployment benar |
| Kode akses tidak valid | Tempel 64 karakter utuh; kode belum kedaluwarsa/dicabut |
| Nama belum cocok atau ganda | Periksa nama dalam Script Properties dan satu baris unik `Database_Murid` |
| Program/maddah kosong | Lengkapi sel santri tersebut; aplikasi sengaja tidak mengambil jadwal semua orang |
| Jadwal kosong | Ada jadwal bertanggal hari ini/mendatang, nama program dan maddah cocok, serta tanggal valid |
| Sesi belum ditemukan | `ID_Sesi` pada log harus cocok dengan `ID_Sesi` di `Sesi_Kelas` |
| Perubahan kode backend tidak tampak | Deploy versi baru, lalu refresh website |
| Waktu koneksi habis | Coba ulang; periksa Executions dan kuota layanan Apps Script |

Jangan menambahkan `mode: 'no-cors'`: hasil fetch menjadi opaque dan JSON tidak dapat dibaca. Implementasi memakai `Content-Type: text/plain;charset=utf-8` untuk POST tanpa preflight. Tidak ada fallback JSONP untuk data pribadi.

## 10. Batas validasi dan pengembangan berikutnya

Pemeriksaan sintaks serta 58 pengujian aplikasi lama dan 9 pengujian integrasi baru berhasil. Pengujian backend memakai simulasi layanan Apps Script, mencakup isolasi santri, duplikasi log, multi-program, tanggal Kairo, pencabutan kode, header salah, dan error frontend. Eksekusi langsung di Google Apps Script dan alur live lintas domain belum diuji karena deployment belum dibuat. Browser lokal tidak dapat dijalankan karena pembatasan socket lingkungan; browser bersama tidak dapat menjangkau preview lokal, sehingga pengujian visual desktop/HP belum terverifikasi.

Login, akun demo, materi berbayar, dan pengelolaan lokal pada proyek lama belum menjadi sistem multiuser server. Token API ini hanya mengatur akses ke data spreadsheet pribadi. Untuk menyatukan login website dan spreadsheet secara otomatis kelak, diperlukan ID santri stabil dan autentikasi server yang terverifikasi. Tidak perlu mengubah struktur spreadsheet sekarang untuk memakai paket ini.

Rujukan pemasangan resmi:

- https://developers.google.com/apps-script/guides/web
- https://developers.google.com/apps-script/guides/content
