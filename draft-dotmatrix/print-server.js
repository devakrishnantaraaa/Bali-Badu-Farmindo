/**
 * ============================================================
 * DRAFT: Local Print Server untuk Epson TM-U220 via LAN
 * ============================================================
 * STATUS: DRAFT - Belum diaktifkan. Printer belum datang.
 * 
 * CARA PAKAI (setelah printer datang):
 *   1. Set IP statis printer (misal: 192.168.1.100) via panel printer
 *   2. Install dependencies: npm install express cors
 *   3. Jalankan: node print-server.js
 *   4. Biarkan jalan terus di background (atau pakai PM2)
 * 
 * AUTO START pakai PM2:
 *   npm install -g pm2
 *   pm2 start print-server.js --name "print-server"
 *   pm2 save
 *   pm2 startup
 * ============================================================
 */

const express = require('express');
const cors    = require('cors');
const net     = require('net');

const app = express();
app.use(cors()); // Izinkan request dari browser (localhost / LAN)
app.use(express.json());

// ============================================================
// KONFIGURASI — Sesuaikan setelah printer terpasang
// ============================================================
const PRINTER_IP   = '192.168.1.100'; // <-- ganti sesuai IP printer di jaringan
const PRINTER_PORT = 9100;            // Port RAW printing standar Epson
const SERVER_PORT  = 3001;            // Port local server ini (di PC kasir)
// ============================================================

/**
 * Kirim raw ESC/P data ke printer via TCP socket
 */
function sendToPrinter(rawData) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        const timeout = setTimeout(() => {
            client.destroy();
            reject(new Error('Timeout: Printer tidak merespons dalam 5 detik'));
        }, 5000);

        client.connect(PRINTER_PORT, PRINTER_IP, () => {
            client.write(Buffer.from(rawData, 'binary'));
            client.end();
        });

        client.on('close', () => {
            clearTimeout(timeout);
            resolve();
        });

        client.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

/**
 * Endpoint: Cek status server
 */
app.get('/status', (req, res) => {
    res.json({
        status: 'online',
        printer_ip: PRINTER_IP,
        printer_port: PRINTER_PORT,
        message: 'Print server siap'
    });
});

/**
 * Endpoint: Cetak nota penjualan
 * Body: { lines: [...], copies: 1 }
 */
app.post('/print/nota', async (req, res) => {
    try {
        const { escData } = req.body;
        if (!escData) {
            return res.status(400).json({ error: 'escData wajib diisi' });
        }

        await sendToPrinter(escData);
        res.json({ success: true, message: 'Nota berhasil dicetak' });

    } catch (err) {
        console.error('[PRINT ERROR]', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Endpoint: Tes koneksi printer (cetak 1 baris test)
 */
app.post('/print/test', async (req, res) => {
    try {
        const ESC = '\x1B';
        const LF  = '\x0A';
        const testData = [
            ESC + '@',                   // Reset
            ESC + 'E' + '\x01',         // Bold ON
            'TEST PRINT\n',
            ESC + 'E' + '\x00',         // Bold OFF
            'Dewata Jaya Supplier\n',
            'Epson TM-U220 Ready!\n',
            '================================\n',
            LF + LF + LF,               // Feed paper
        ].join('');

        await sendToPrinter(testData);
        res.json({ success: true, message: 'Test print berhasil!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(SERVER_PORT, () => {
    console.log(`
╔══════════════════════════════════════╗
║   Print Server Dewata Jaya - READY   ║
╚══════════════════════════════════════╝
  Server     : http://localhost:${SERVER_PORT}
  Printer IP : ${PRINTER_IP}:${PRINTER_PORT}
  
  Endpoints:
  GET  /status       — Cek status server
  POST /print/nota   — Cetak nota
  POST /print/test   — Test print
`);
});

