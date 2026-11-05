/**
 * tcp-printer-bridge.js
 * Jembatan antara index.html dan TcpPrinterPlugin (Android native)
 * 
 * Di-load oleh index.html, tapi hanya aktif saat jalan sebagai APK.
 * Di browser biasa, semua fungsi akan return error message yang informatif.
 */

(function () {
    'use strict';

    // Deteksi apakah jalan di APK Capacitor atau browser biasa
    const IS_NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform());

    // Konfigurasi printer — bisa diubah dari Settings di app
    const PRINTER_CONFIG_KEY = 'dotmatrix_printer_config';

    function getPrinterConfig() {
        const saved = localStorage.getItem(PRINTER_CONFIG_KEY);
        if (saved) return JSON.parse(saved);
        return { ip: '192.168.1.100', port: 9100 }; // default
    }

    function savePrinterConfig(ip, port) {
        localStorage.setItem(PRINTER_CONFIG_KEY, JSON.stringify({ ip, port: parseInt(port) }));
    }

    /**
     * Cek apakah printer bisa dijangkau
     * @returns {Promise<{reachable: boolean, message: string}>}
     */
    async function pingPrinter() {
        if (!IS_NATIVE) {
            return { reachable: false, message: 'Fitur ini hanya tersedia di APK Android' };
        }
        const { ip, port } = getPrinterConfig();
        return await window.Capacitor.Plugins.TcpPrinter.ping({ ip, port });
    }

    /**
     * Kirim raw ESC/P data ke printer
     * @param {string} escData - String ESC/P
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async function sendToPrinter(escData) {
        if (!IS_NATIVE) {
            return { success: false, message: 'Fitur cetak dot matrix hanya tersedia di APK Android' };
        }
        const { ip, port } = getPrinterConfig();
        return await window.Capacitor.Plugins.TcpPrinter.print({ ip, port, data: escData });
    }

    // ================================================================
    // Format ESC/P untuk nota penjualan Epson TM-U220 (75mm)
    // ================================================================

    const ESC  = '\x1B';
    const LF   = '\x0A';
    const GS   = '\x1D';
    const COLS = 42;

    function padRow(left, right, width) {
        width = width || COLS;
        const space = width - left.length - right.length;
        return left + ' '.repeat(Math.max(1, space)) + right;
    }

    function center(text, width) {
        width = width || COLS;
        const pad = Math.max(0, Math.floor((width - text.length) / 2));
        return ' '.repeat(pad) + text;
    }

    function divider(ch, width) {
        ch = ch || '-';
        width = width || COLS;
        return ch.repeat(width);
    }

    function formatRp(amount) {
        return 'Rp ' + Number(amount || 0).toLocaleString('id-ID');
    }

    /**
     * Generate ESC/P string untuk nota penjualan
     */
    function generateEscP(notaData) {
        const customerName  = notaData.customerName  || '-';
        const invoiceNumber = notaData.invoiceNumber || '-';
        const date          = notaData.date          || '-';
        const salesName     = notaData.salesName     || 'Admin';
        const items         = notaData.items         || [];
        const total         = notaData.total         || 0;
        const paid          = notaData.paid          || 0;
        const sisa          = notaData.sisa          || 0;

        let out = '';

        // Reset printer
        out += ESC + '@';

        // === HEADER ===
        out += ESC + 'E\x01';
        out += center('DEWATA JAYA SUPPLIER') + LF;
        out += ESC + 'E\x00';
        out += center('Telp: 08xx-xxxx-xxxx') + LF;
        out += divider('=') + LF;

        // === INFO NOTA ===
        out += padRow('No. Nota :', invoiceNumber.substring(0, 28)) + LF;
        out += padRow('Tanggal  :', date) + LF;
        out += padRow('Customer :', customerName.substring(0, 28)) + LF;
        out += padRow('Sales    :', salesName) + LF;
        out += divider('-') + LF;

        // === HEADER KOLOM ===
        out += ESC + 'E\x01';
        out += padRow('PRODUK / ITEM', 'SUBTOTAL') + LF;
        out += ESC + 'E\x00';
        out += divider('-') + LF;

        // === BARIS ITEM ===
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const name    = String(item.name    || '-').substring(0, COLS);
            const qtyLine = '  ' + item.qty + ' ' + (item.unit || 'krat') + ' x ' + formatRp(item.harga);
            const sub     = formatRp(item.subtotal);
            out += name + LF;
            out += padRow(qtyLine, sub) + LF;
        }

        out += divider('=') + LF;

        // === TOTAL ===
        out += ESC + 'E\x01';
        out += padRow('TOTAL TAGIHAN', formatRp(total)) + LF;
        out += ESC + 'E\x00';

        if (paid > 0) {
            out += padRow('Dibayar', formatRp(paid)) + LF;
            out += padRow('Sisa', formatRp(sisa)) + LF;
        }

        out += divider('=') + LF;

        // === FOOTER TTD ===
        out += LF;
        out += padRow('Penerima,', 'Hormat Kami,') + LF;
        out += LF + LF + LF;
        out += padRow('(' + customerName.substring(0, 16) + ')', '(' + salesName + ')') + LF;
        out += LF;

        // Feed & cut
        out += LF + LF + LF;
        out += GS + 'V\x01'; // partial cut

        return out;
    }

    /**
     * Fungsi utama: cetak nota ke dot matrix
     * Dipanggil dari index.html saat mode printer = dotmatrix
     */
    async function cetakNotaDotMatrix(notaData) {
        try {
            // 1. Cek koneksi printer dulu
            const pingResult = await pingPrinter();
            if (!pingResult.reachable) {
                if (typeof showAlert === 'function') {
                    showAlert('⚠️ Printer tidak terjangkau!\n' + pingResult.message, true);
                } else {
                    alert('Printer tidak terjangkau: ' + pingResult.message);
                }
                return false;
            }

            // 2. Generate ESC/P
            const escData = generateEscP(notaData);

            // 3. Kirim ke printer
            const result = await sendToPrinter(escData);
            if (!result.success) {
                if (typeof showAlert === 'function') {
                    showAlert('❌ Gagal cetak: ' + result.message, true);
                }
                return false;
            }

            if (typeof showAlert === 'function') {
                showAlert('✅ Nota berhasil dicetak ke printer dot matrix!');
            }
            return true;

        } catch (err) {
            if (typeof showAlert === 'function') {
                showAlert('❌ Error: ' + err.message, true);
            }
            return false;
        }
    }

    // ================================================================
    // Settings UI helper: buka modal konfigurasi IP printer
    // (dipanggil dari Settings di index.html)
    // ================================================================
    function openPrinterSettings() {
        const cfg = getPrinterConfig();
        const ip = prompt('IP Address Printer (contoh: 192.168.1.100):', cfg.ip);
        if (ip === null) return;
        const port = prompt('Port Printer (default: 9100):', cfg.port);
        if (port === null) return;
        savePrinterConfig(ip, port);
        alert('Konfigurasi printer disimpan!\nIP: ' + ip + '\nPort: ' + port);
    }

    // Expose ke global scope agar bisa dipanggil dari index.html
    window.TcpPrinterBridge = {
        isNative        : IS_NATIVE,
        getPrinterConfig: getPrinterConfig,
        savePrinterConfig: savePrinterConfig,
        pingPrinter     : pingPrinter,
        sendToPrinter   : sendToPrinter,
        generateEscP    : generateEscP,
        cetakNotaDotMatrix: cetakNotaDotMatrix,
        openPrinterSettings: openPrinterSettings,
    };

    console.log('[TcpPrinterBridge] Loaded. IS_NATIVE =', IS_NATIVE);
})();

