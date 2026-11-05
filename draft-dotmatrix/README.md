# 📦 DRAFT: Migrasi ke Epson TM-U220 (Dot Matrix 75mm via LAN)

> **STATUS: DRAFT — Belum diaktifkan. Printer belum datang.**  
> Thermal printer iware yang sekarang tetap berfungsi normal.

---

## Isi Folder ini

| File | Fungsi |
|---|---|
| `print-server.js` | Local server yang jalan di PC kasir, menjembatani browser → printer via TCP |
| `escp-formatter.js` | Fungsi generate format ESC/P (bahasa dot matrix) untuk nota |
| `README.md` | Panduan ini |

---

## Langkah Aktivasi (saat printer sudah datang)

### Step 1: Setup Printer
1. Pasang LAN card ke slot TM-U220
2. Hubungkan kabel LAN ke router
3. Set IP statis printer:
   - Masuk ke printer settings (tekan tombol di printer saat nyala)
   - Set IP: `192.168.1.100` (atau sesuai jaringan)
   - Subnet: `255.255.255.0`
   - Gateway: `192.168.1.1`
4. Test koneksi: `ping 192.168.1.100` dari CMD

### Step 2: Setup Print Server di PC Kasir
```bash
# Di folder draft-dotmatrix
npm install express cors

# Jalankan server
node print-server.js
```

### Step 3: Set IP di print-server.js
Buka `print-server.js`, ganti baris:
```js
const PRINTER_IP = '192.168.1.100'; // <-- ganti sesuai IP printer asli
```

### Step 4: Test Print
Buka browser, akses:
```
POST http://localhost:3001/print/test
```
Atau bisa test langsung dari web app.

### Step 5: Auto Start pakai PM2
```bash
npm install -g pm2
pm2 start print-server.js --name "print-server-dewata"
pm2 save
pm2 startup
```
PM2 akan restart otomatis saat PC hidup.

### Step 6: Integrasi ke index.html
Aktifkan baris di akhir `escp-formatter.js`:
```js
window.printNotaToEpsonTMU220 = printNotaToEpsonTMU220;
window.generateEscP = generateEscP;
```
Lalu tambahkan `<script src="escp-formatter.js">` di `index.html`.

---

## Catatan Penting

- **Kertas 75mm, 2 atau 3 ply** → printer yang duplikat otomatis, tidak perlu setting khusus di software
- **Partial cut** sudah ada di `generateEscP()` via perintah `GS V \x01`
- **Kolom**: 42 karakter per baris (font normal 10cpi di 75mm)
- **Yang perlu diupdate** di `escp-formatter.js`:
  - Alamat toko di HEADER
  - Nomor telepon

---

## Thermal Lama vs Dot Matrix Baru

| | Thermal iware (sekarang) | TM-U220 (nanti) |
|---|---|---|
| Format print | HTML/CSS via iframe | ESC/P plain text |
| Lebar | ~58mm | 75mm |
| Rangkap | 1 lembar | 2-3 lembar otomatis |
| Koneksi | Bluetooth | LAN (WiFi-able) |
| Print dari banyak HP | ❌ | ✅ |

