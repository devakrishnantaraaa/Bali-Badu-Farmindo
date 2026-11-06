/**
 * tcp-printer-bridge.js
 * Jembatan antara index.html dan TcpPrinterPlugin (Android native)
 * Khusus Epson TM-U220 Dot Matrix 76mm via TCP Port 9100.
 */

(function () {
    'use strict';

    // Deteksi apakah jalan di APK Capacitor atau browser biasa
    const IS_NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform());

    // Konfigurasi printer — disimpan di localStorage
    const PRINTER_CONFIG_KEY = 'dotmatrix_printer_config';

    function getPrinterConfig() {
        const saved = localStorage.getItem(PRINTER_CONFIG_KEY);
        if (saved) {
            try { return JSON.parse(saved); } catch (e) {}
        }
        return { ip: '192.168.110.200', port: 9100, printLogo: true }; // default
    }

    function savePrinterConfig(ip, port, printLogo) {
        const cfg = {
            ip: (ip || '192.168.110.200').trim(),
            port: parseInt(port || 9100, 10),
            printLogo: printLogo !== false
        };
        localStorage.setItem(PRINTER_CONFIG_KEY, JSON.stringify(cfg));
        return cfg;
    }

    /**
     * Cek apakah printer bisa dijangkau
     */
    async function pingPrinter() {
        if (!IS_NATIVE) {
            return { reachable: false, message: 'Fitur cetak langsung hanya tersedia di aplikasi Android (APK)' };
        }
        const { ip, port } = getPrinterConfig();
        return await window.Capacitor.Plugins.TcpPrinter.ping({ ip, port });
    }

    /**
     * Kirim raw ESC/P data ke printer
     */
    async function sendToPrinter(escData) {
        if (!IS_NATIVE) {
            return { success: false, message: 'Fitur cetak dot matrix hanya tersedia di aplikasi Android (APK)' };
        }
        const { ip, port } = getPrinterConfig();
        return await window.Capacitor.Plugins.TcpPrinter.print({ ip, port, data: escData });
    }

    // ================================================================
    // PRE-ENCODED DJS LOGO (Monochrome 112x112 dots, ESC * 8-dot single density)
    // Dihitung khusus agar terpusat rapi di kertas 76mm TM-U220
    // ================================================================
    const DJS_LOGO_B64 = 
        'GzMQGyoAnAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKGyoAnAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAgYHB4fHx8fHx8PDwMDAw' +
        'MHBg4OHh4eHh4eHh8fHx8fHx8PDw8PDwcHAwMBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
        'AAAAAAAAAAAKGyoAnAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAA4P//////////////AAAAAAAAAgAAAAAAAAAAgICAwMDg8Pj8/v////9/Px8P' +
        'BwEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKGyoAnAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB///////////////AAA' +
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADA8P7/////////HwMAAAAAAAAAAAAAAAAAAwMAAAAAAAAAAAAAAAAAAA' +
        'AAAAAKGyoAnAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
        'AAAAAAAAAAAAAAAAAAAAAAA/v/+/Pz4+Pjw8PDwAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAD/////////' +
        '//gAAAEAAAMDAQMAADjgwQEDAgAAAAAAAAAAAAAAAAAAAAAKGyoAnAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAA' +
        'AAA8fP3////8HAAAAAAAAAAABD//////+/PDhgw8f/98PAADg8MEHBwuBgQAAAAAAAQAAAAAAAAAAAAAAAAAKGy' +
        'oAnAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
        'AAAAA8/fz8+GCADBw8fP39///8AAAAAAAAAAAAAAAAAD//////////+AAAAAQcOPHj48ePHjw8/f/7+/Pj48cED' +
        'AwMHBwePj4+PHx8/P3/8wAAAAAAAAAAAAAAAAAAKGyoAnAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADg4PCAAP/////////////8BAAAAAAAAAAABAw8///' +
        '///Pj48MAAAACAAAAAAAAB0ePnz4+fPz9/f/7+/vz9+fv39+///////vjwwAAAAAAAAAAAAAAAAAAAAAAKGyoAn' +
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
        'AAAAAAAgMDw+Pj8/P7+////fz8fDwcHAwPj4+PDyIiIAAAAAAAAAAAAECBgYODAyMjYmJCAgAAACDx8fPj4+Pj' +
        'w8ODAwIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKGyoAnAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAAAAAAMAAAMDAQEBAAAAAwABBwMBAAMAAAADAAQDAAAAAA' +
        'cICAAAAw4OAwAAAAAAAAAAAA8AAAADDg4DAAAMBwMDDggAAwcOBwEAAAAAAAAAAAAAAAAAAAAAAAAKGyoAnAAAA' +
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAODgYCBg' +
        '4MAAAODgICAgIAAA4ODgAADg4MAAIODAwMDA4CAAAOAAACDgwMDAwOAgAAAAYGAwYOAAIODAwMDA4CAAAPDgAA' +
        'Bw4MDAwOBwAAAAAAAAAAAAAAAAAAAAAAAKGyoAnAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAQAAAAABAQEDAAAAAAMDAwICAgICAAAAAAAAAQMDAwIC' +
        'AgICAAAAAAAAAwMDAAAAAAAAAAADAwMDAAAAAwMDAwAAAAAAAAAAAAMDAwICAwEDAwAAAAAAAAAKGyoAnAAAAAA' +
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEDg4GBgYODg4MAAAAAAgEDg4O' +
        'BgYODg4MCAAAAAIODg4AAAAAAAAAAAAAAA4ODg4AAAAAAAAAAAAAAA4ODg4ODg4ODgAADg4ODgAAAA4ODg4ODg4' +
        'ODg4AAAIODg4AAAAMDg4OBgIAAAAAAKGyoAnAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKGz' +
        'IK';

    function getLogoBinary() {
        try {
            return atob(DJS_LOGO_B64);
        } catch (e) {
            console.warn('[TcpPrinterBridge] Gagal decode logo binary:', e);
            return '';
        }
    }

    // ================================================================
    // Format ESC/POS untuk Epson TM-U220 (Kertas 76mm Roll)
    // Font A (9x9) TM-U220 = 33 Kolom.
    // Menggunakan COLS = 32 agar 100% rapi dan tidak pernah overflow/wrapping!
    // ================================================================

    const ESC  = '\x1B';
    const LF   = '\x0A';
    const GS   = '\x1D';
    const COLS = 32;

    function pad2Col(left, right, width) {
        width = width || COLS;
        const lStr = String(left || '');
        const rStr = String(right || '');
        const maxLeft = Math.max(0, width - rStr.length - 1);
        const lCut = lStr.substring(0, maxLeft);
        const space = Math.max(1, width - lCut.length - rStr.length);
        return lCut + ' '.repeat(space) + rStr;
    }

    function center(text, width) {
        width = width || COLS;
        const str = String(text || '');
        const pad = Math.max(0, Math.floor((width - str.length) / 2));
        return ' '.repeat(pad) + str;
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
     * Generate ESC/POS string untuk nota penjualan Epson TM-U220
     * Diformat presisi 32 kolom, identik dengan struk thermal Bluetooth / RawBT
     */
    function generateEscP(notaData, options) {
        options = options || {};
        const cfg = getPrinterConfig();
        const shouldPrintLogo = (typeof options.includeLogo !== 'undefined') ? options.includeLogo : (cfg.printLogo !== false);

        const customerName  = String(notaData.customerName  || notaData.customer_name || 'Pelanggan');
        const invoiceNumber = String(notaData.invoiceNumber || notaData.invoice_number || 'INV-001');
        
        let date = notaData.date || notaData.order_date || '';
        if (date && typeof date === 'string' && date.includes('T')) {
            date = date.split('T')[0];
        }
        if (!date) {
            date = new Date().toLocaleDateString('id-ID');
        }

        const salesName   = String(notaData.salesName || notaData.sales_name || 'Sales DJS');
        const items       = notaData.items || [];
        const total       = Number(notaData.total || notaData.total_amount || 0);
        const rawStatus   = String(notaData.paymentType || notaData.payment_type || notaData.status || 'LUNAS').toUpperCase();
        const isLunas     = rawStatus.includes('LUNAS');
        const statusLabel = isLunas ? 'LUNAS (CASH/TF)' : 'PENDING (TEMPO)';
        const paid        = Number(notaData.paid || notaData.amount_paid || (isLunas ? total : 0));
        const sisa        = Number(notaData.sisa || notaData.sisa_pembayaran || (isLunas ? 0 : total));

        let out = '';

        // Reset printer ke initial state
        out += ESC + '@';

        // 1. CETAK LOGO DJS (Jika aktif)
        if (shouldPrintLogo) {
            out += getLogoBinary();
        }

        // 2. HEADER BRANDING (Center, Double Height & Double Width, Sama Persis Struk Thermal)
        out += ESC + 'a\x01'; // Align Center
        out += ESC + '!\x30'; // Double height + Double width
        out += 'DEWATA JAYA\n';
        out += ESC + '!\x10'; // Double height
        out += 'SUPPLIER TELUR\n';
        out += ESC + '!\x00'; // Normal text
        out += 'Distribusi Telur Berkualitas\n';
        out += 'Telp/WA: +62 823-3903-3923\n';
        out += divider('=') + LF;

        // 3. META INFORMASI TRANSAKSI (Align Left, 32 Kolom)
        out += ESC + 'a\x00'; // Align Left
        out += pad2Col('No. Nota :', invoiceNumber) + LF;
        out += pad2Col('Tanggal  :', date) + LF;
        out += pad2Col('Sales    :', salesName) + LF;
        out += pad2Col('Customer :', customerName) + LF;
        out += pad2Col('Tipe TOP :', statusLabel) + LF;

        if (!isLunas && notaData.dueDate) {
            let dueStr = String(notaData.dueDate);
            if (dueStr.includes('T')) dueStr = dueStr.split('T')[0];
            out += pad2Col('Tempo s/d:', dueStr) + LF;
        }

        out += divider('-') + LF;

        // 4. RINCIAN PRODUK
        if (items.length > 0) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const pName = String(item.name || item.product_name || 'Telur Ayam Ras');
                const qty   = Number(item.qty || item.quantity || 1);
                const unit  = item.unit || 'krat';
                const harga = Number(item.harga || item.unit_price || item.price || 0);
                const sub   = Number(item.subtotal || item.total || (qty * harga));

                out += pName + LF;
                out += pad2Col('  ' + qty + ' ' + unit + ' x ' + formatRp(harga), formatRp(sub)) + LF;
            }
        } else {
            // Fallback jika dikirim objek single-product
            const pName = String(notaData.product_name || 'Telur Ayam Ras');
            const qty   = Number(notaData.quantity || 1);
            const unit  = notaData.unit || 'krat';
            const harga = Number(notaData.unit_price || notaData.price || 0);
            out += pName + LF;
            out += pad2Col('  ' + qty + ' ' + unit + ' x ' + formatRp(harga), formatRp(total)) + LF;
        }

        out += divider('-') + LF;

        // 5. TOTAL & STATUS BAYAR (Bold)
        out += ESC + 'E\x01'; // Bold ON
        out += pad2Col('TOTAL NOTA   :', formatRp(total)) + LF;
        out += pad2Col('STATUS BAYAR :', isLunas ? 'LUNAS' : 'BELUM LUNAS') + LF;
        
        if (!isLunas && paid > 0) {
            out += pad2Col('Dibayar      :', formatRp(paid)) + LF;
            out += pad2Col('Sisa Tagihan :', formatRp(sisa)) + LF;
        }
        out += ESC + 'E\x00'; // Bold OFF
        out += divider('=') + LF;

        // 6. INFO REKENING BCA (Center)
        out += ESC + 'a\x01'; // Align Center
        out += 'Transfer Bank BCA:\n';
        out += ESC + 'E\x01'; // Bold ON
        out += '1468924624\n';
        out += '(Dewata Jaya Supplier)\n';
        out += ESC + 'E\x00'; // Bold OFF
        out += divider('-') + LF;

        // 7. UCAPAN TERIMA KASIH (Center)
        out += 'Simpan nota sbg bukti sah.\n';
        out += ESC + 'E\x01'; // Bold ON
        out += 'Terima Kasih!\n';
        out += 'Atas Kepercayaannya\n';
        out += ESC + 'E\x00'; // Bold OFF

        // 8. FEED & CUT
        out += LF + LF + LF + LF;
        out += GS + 'V\x01'; // Partial Cut

        return out;
    }

    /**
     * Fungsi utama cetak nota ke dot matrix
     */
    async function cetakNotaDotMatrix(notaData) {
        try {
            // 1. Cek koneksi printer
            const pingResult = await pingPrinter();
            if (!pingResult.reachable) {
                if (typeof showAlert === 'function') {
                    showAlert('⚠️ Printer tidak terjangkau!\n' + pingResult.message, true);
                } else {
                    alert('Printer tidak terjangkau: ' + pingResult.message);
                }
                return false;
            }

            // 2. Generate ESC/POS rapi 32 kolom + Logo
            const escData = generateEscP(notaData);

            // 3. Kirim ke printer via TCP socket
            const result = await sendToPrinter(escData);
            if (!result.success) {
                if (typeof showAlert === 'function') {
                    showAlert('❌ Gagal cetak: ' + result.message, true);
                }
                return false;
            }

            if (typeof showAlert === 'function') {
                showAlert('✅ Nota berhasil dicetak ke Epson TM-U220!');
            }
            return true;

        } catch (err) {
            if (typeof showAlert === 'function') {
                showAlert('❌ Error cetak: ' + err.message, true);
            }
            return false;
        }
    }

    /**
     * Test print untuk cek koneksi fisik dan verifikasi kerapian 32-kolom
     */
    async function testPrintConnection() {
        const cfg = getPrinterConfig();
        let testStr = ESC + '@'; // init

        // Logo
        if (cfg.printLogo !== false) {
            testStr += getLogoBinary();
        }

        testStr += ESC + 'a\x01'; // center
        testStr += ESC + '!\x30'; // double size
        testStr += 'DEWATA JAYA\n';
        testStr += ESC + '!\x10'; // double height
        testStr += 'SUPPLIER TELUR\n';
        testStr += ESC + '!\x00'; // normal
        testStr += divider('=') + LF;
        testStr += ESC + 'E\x01';
        testStr += 'TES PRINTER EPSON TM-U220\n';
        testStr += ESC + 'E\x00';
        testStr += divider('-') + LF;

        testStr += ESC + 'a\x00'; // left
        testStr += pad2Col('Status   :', 'KONEKSI LAN OK') + LF;
        testStr += pad2Col('Waktu    :', new Date().toLocaleTimeString('id-ID')) + LF;
        testStr += pad2Col('IP Target:', cfg.ip) + LF;
        testStr += pad2Col('Format   :', '32 Kolom (Rapi)') + LF;
        testStr += divider('-') + LF;

        testStr += ESC + 'a\x01'; // center
        testStr += 'Aplikasi Siap Digunakan!\n';
        testStr += 'Format Struk Sesuai Thermal\n';
        testStr += divider('=') + LF;
        testStr += LF + LF + LF + LF;
        testStr += GS + 'V\x01'; // cut

        return await sendToPrinter(testStr);
    }

    /**
     * Settings modal konfigurasi printer
     */
    async function openPrinterSettings() {
        const cfg = getPrinterConfig();
        const currentServer = localStorage.getItem('app_backend_server_url') || 'https://dewata-jaya-supplier.vercel.app';
        
        const serverUrl = prompt('URL Server Backend Dewata Jaya:', currentServer);
        if (serverUrl !== null && serverUrl.trim()) {
            localStorage.setItem('app_backend_server_url', serverUrl.trim().replace(/\/+$/, ''));
        }

        const ip = prompt('IP Address Printer TM-U220:', cfg.ip);
        if (ip === null) return;

        const port = prompt('Port Printer (default: 9100):', cfg.port);
        if (port === null) return;

        const printLogo = confirm('Cetak Logo DJS di bagian atas struk?\n\nKlik OK untuk YA (dengan logo)\nKlik Batal untuk TIDAK (teks saja)');

        savePrinterConfig(ip, port, printLogo);

        const doTest = confirm('Pengaturan disimpan!\nIP: ' + ip + ':' + port + '\nLogo: ' + (printLogo ? 'Aktif' : 'Non-aktif') + '\n\nTes cetak sekarang?');
        if (doTest) {
            if (typeof showAlert === 'function') showAlert('⏳ Mengirim tes cetak ke Epson TM-U220...');
            const res = await testPrintConnection();
            if (res && res.success) {
                alert('✅ Berhasil! Kertas tes cetak telah keluar dari printer.');
            } else {
                alert('❌ Gagal tes cetak: ' + (res ? res.message : 'Error') + '\n\nPastikan HP terhubung ke WiFi toko dan IP printer sesuai.');
            }
        }
    }

    // Expose ke window
    window.TcpPrinterBridge = {
        isNative: IS_NATIVE,
        getPrinterConfig: getPrinterConfig,
        savePrinterConfig: savePrinterConfig,
        pingPrinter: pingPrinter,
        sendToPrinter: sendToPrinter,
        getLogoBinary: getLogoBinary,
        generateEscP: generateEscP,
        cetakNotaDotMatrix: cetakNotaDotMatrix,
        testPrintConnection: testPrintConnection,
        openPrinterSettings: openPrinterSettings,
    };

    console.log('[TcpPrinterBridge] Initialized. IS_NATIVE =', IS_NATIVE);
})();
