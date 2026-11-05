# 📱 DRAFT: Bungkus Web App jadi APK Android (Capacitor)

> **STATUS: DRAFT — Tunggu printer TM-U220 datang & setup LAN dulu.**  
> Setelah printer bisa diakses di jaringan, baru aktifkan ini.

---

## Konsep

```
Web app yang sudah ada (index.html)
         +
Capacitor (wrapper APK)
         +
Plugin TCP Socket
         =
📱 APK Android yang bisa cetak langsung ke TM-U220
```

Tidak perlu rewrite apapun — web app yang sekarang tetap sama persis.  
Capacitor hanya "membungkus" nya menjadi APK.

---

## Yang Dibutuhkan

| Kebutuhan | Keterangan |
|---|---|
| Node.js | Sudah ada |
| Android Studio | Download gratis di developer.android.com |
| Java JDK 17+ | Sudah include di Android Studio |
| Kapasitor CLI | `npm install @capacitor/core @capacitor/cli` |
| Plugin TCP | `@capacitor-community/tcp` |

---

## Struktur Folder Nanti

```
inventory-telor/
├── src/
│   └── public/
│       └── index.html          ← tetap sama, tidak diubah
├── android/                    ← folder APK (auto-generate oleh Capacitor)
│   └── app/
│       └── src/main/...
├── capacitor.config.json       ← konfigurasi Capacitor
└── package.json
```

---

## Langkah Setup (saat siap)

### Step 1: Install Capacitor
```bash
cd c:\Users\Madeb\.gemini\antigravity\scratch\inventory-telor
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Dewata Jaya" "com.dewatajaya.inventory" --web-dir src/public
```

### Step 2: Install Plugin TCP Socket
```bash
npm install @capacitor-community/tcp
npx cap sync
```

### Step 3: Generate Folder Android
```bash
npx cap add android
npx cap sync android
```

### Step 4: Buka di Android Studio
```bash
npx cap open android
```
Lalu build APK: **Build → Build Bundle/APK → Build APK**

### Step 5: Install APK di HP
Transfer file `.apk` ke HP → install → selesai.

---

## Cara Print dari APK

Di `index.html`, saat klik cetak nota ke TM-U220,  
panggil fungsi ini (gantikan fungsi thermal yang lama):

```js
// Deteksi apakah jalan di APK (Capacitor) atau browser biasa
const isNativeApp = window.Capacitor && window.Capacitor.isNativePlatform();

async function cetakNotaDotMatrix(notaData) {
    if (!isNativeApp) {
        alert('Fitur cetak dot matrix hanya tersedia di aplikasi Android.\nUntuk browser, gunakan printer thermal.');
        return;
    }

    const { TcpSocket } = await import('@capacitor-community/tcp');
    
    const PRINTER_IP   = '192.168.1.100'; // IP printer di LAN
    const PRINTER_PORT = 9100;

    try {
        // Buka koneksi TCP ke printer
        const socket = await TcpSocket.create({});
        await TcpSocket.connect({ 
            clientId: socket.clientId, 
            host: PRINTER_IP, 
            port: PRINTER_PORT 
        });

        // Generate ESC/P data (dari escp-formatter.js)
        const escData = generateEscP(notaData);

        // Kirim ke printer
        await TcpSocket.send({ 
            clientId: socket.clientId, 
            data: escData 
        });

        // Tutup koneksi
        await TcpSocket.close({ clientId: socket.clientId });

        showAlert('Nota berhasil dicetak ke TM-U220! ✅');
    } catch (err) {
        showAlert('Gagal cetak: ' + err.message, true);
    }
}
```

---

## Tombol Cetak di index.html (nanti)

Saat APK sudah jadi, tambahkan opsi pilih printer:

```
┌─────────────────────────────────┐
│  Pilih Printer:                 │
│  ○ Thermal Bluetooth (iware)    │  ← yang sekarang
│  ○ Dot Matrix TM-U220 (LAN)     │  ← nanti setelah APK jadi
└─────────────────────────────────┘
```

Kode switch:
```js
const printerType = localStorage.getItem('printerType') || 'thermal';

function handleCetak(notaData) {
    if (printerType === 'dotmatrix' && isNativeApp) {
        cetakNotaDotMatrix(notaData);
    } else {
        triggerPrintInvoice(); // fungsi thermal yang sudah ada
    }
}
```

---

## Keuntungan Pendekatan ini

| | Browser biasa | APK (Capacitor) |
|---|---|---|
| Cetak thermal Bluetooth | ✅ | ✅ |
| Cetak dot matrix LAN | ❌ | ✅ |
| Update fitur lain | Auto (Vercel) | Auto (Vercel) |
| Perlu install ulang APK? | - | Hanya jika ada perubahan native |
| Butuh PC kasir? | ❌ | ❌ |
| Butuh Raspberry Pi? | ❌ | ❌ |

> **Catatan:** Fitur web app lain (input penjualan, laporan, dll) tetap  
> auto-update dari Vercel tanpa perlu install ulang APK — karena APK  
> hanya membungkus, konten tetap load dari internet.

---

## Kapan Dikerjakan?

1. ✅ Printer TM-U220 sudah datang
2. ✅ Printer sudah terpasang LAN card & dapat IP statis
3. ✅ Test print dari `escp-formatter.js` sudah OK
4. 🔜 Baru buat APK ini

---

## File Terkait

- [`escp-formatter.js`](./escp-formatter.js) — Format ESC/P untuk nota 75mm
- [`print-server.js`](./print-server.js) — Alternatif jika pakai Raspberry Pi

