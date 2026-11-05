/**
 * ============================================================
 * DRAFT: ESC/P Formatter untuk Epson TM-U220 (75mm / 2-3 ply)
 * ============================================================
 * STATUS: DRAFT - Belum diaktifkan.
 * 
 * File ini berisi fungsi generateEscP() yang nantinya
 * dipanggil dari index.html saat mau cetak nota ke TM-U220.
 * 
 * Karakter per baris di 75mm: ~42 karakter (font normal)
 * ============================================================
 */

// Karakter ESC/P
const ESC = '\x1B';
const LF  = '\x0A';  // Line Feed
const CR  = '\x0D';  // Carriage Return
const FF  = '\x0C';  // Form Feed (ganti lembar)
const GS  = '\x1D';

const COLS = 42; // Max karakter per baris di 75mm

/**
 * Pad string kiri-kanan untuk 1 baris tabel
 */
function padRow(left, right, width = COLS) {
    const space = width - left.length - right.length;
    return left + ' '.repeat(Math.max(1, space)) + right;
}

/**
 * Teks tengah
 */
function center(text, width = COLS) {
    const pad = Math.max(0, Math.floor((width - text.length) / 2));
    return ' '.repeat(pad) + text;
}

/**
 * Garis pembatas
 */
function divider(char = '-', width = COLS) {
    return char.repeat(width);
}

/**
 * Format Rupiah
 */
function formatRp(amount) {
    return 'Rp ' + Number(amount).toLocaleString('id-ID');
}

/**
 * Generate ESC/P string untuk nota penjualan
 * 
 * @param {Object} notaData
 * @param {string} notaData.customerName  - Nama customer
 * @param {string} notaData.invoiceNumber - Nomor nota
 * @param {string} notaData.date          - Tanggal nota
 * @param {string} notaData.salesName     - Nama sales/admin
 * @param {Array}  notaData.items         - [{name, qty, unit, harga, subtotal}]
 * @param {number} notaData.total         - Total tagihan
 * @param {number} notaData.paid          - Sudah dibayar
 * @param {number} notaData.sisa          - Sisa tagihan
 */
function generateEscP(notaData) {
    const {
        customerName  = '-',
        invoiceNumber = '-',
        date          = '-',
        salesName     = 'Admin',
        items         = [],
        total         = 0,
        paid          = 0,
        sisa          = 0,
    } = notaData;

    let out = '';

    // Reset printer
    out += ESC + '@';

    // === HEADER ===
    out += ESC + 'E' + '\x01';                     // Bold ON
    out += center('DEWATA JAYA SUPPLIER') + LF;
    out += ESC + 'E' + '\x00';                     // Bold OFF
    out += center('Jl. [Alamat Toko Anda]') + LF;
    out += center('Telp: 08xx-xxxx-xxxx') + LF;
    out += divider('=') + LF;

    // === INFO NOTA ===
    out += padRow('No. Nota :', invoiceNumber) + LF;
    out += padRow('Tanggal  :', date) + LF;
    out += padRow('Customer :', customerName) + LF;
    out += padRow('Sales    :', salesName) + LF;
    out += divider('-') + LF;

    // === HEADER KOLOM ===
    out += ESC + 'E' + '\x01';
    out += padRow('PRODUK / ITEM', 'SUBTOTAL') + LF;
    out += ESC + 'E' + '\x00';
    out += divider('-') + LF;

    // === BARIS ITEM ===
    for (const item of items) {
        const nameLine  = String(item.name || '-').substring(0, COLS);
        const qtyLine   = `  ${item.qty} ${item.unit} x ${formatRp(item.harga)}`;
        const subtotal  = formatRp(item.subtotal);

        out += nameLine + LF;
        out += padRow(qtyLine, subtotal) + LF;
    }

    out += divider('=') + LF;

    // === TOTAL ===
    out += ESC + 'E' + '\x01';
    out += padRow('TOTAL TAGIHAN', formatRp(total)) + LF;
    out += ESC + 'E' + '\x00';

    if (paid > 0) {
        out += padRow('Dibayar', formatRp(paid)) + LF;
        out += padRow('Sisa Tagihan', formatRp(sisa)) + LF;
    }

    out += divider('=') + LF;

    // === FOOTER TTD ===
    out += LF;
    out += padRow('Penerima,', 'Hormat Kami,') + LF;
    out += LF + LF + LF;
    out += padRow('(________________)', '(' + salesName + ')') + LF;
    out += padRow(customerName, 'Dewata Jaya Supplier') + LF;

    // Feed paper & cut (partial cut)
    out += LF + LF + LF + LF;
    out += GS + 'V' + '\x01'; // Partial cut

    return out;
}

// ============================================================
// Fungsi integrasi ke index.html (dipanggil saat klik Cetak)
// ============================================================
async function printNotaToEpsonTMU220(notaData) {
    const PRINT_SERVER = 'http://localhost:3001'; // Local print server di PC kasir

    try {
        // 1. Cek server online
        const statusRes = await fetch(`${PRINT_SERVER}/status`);
        if (!statusRes.ok) throw new Error('Print server tidak aktif di PC kasir');

        // 2. Generate ESC/P data
        const escData = generateEscP(notaData);

        // 3. Kirim ke print server
        const res = await fetch(`${PRINT_SERVER}/print/nota`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ escData })
        });

        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Gagal cetak');

        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// Export untuk dipakai di index.html (saat diaktifkan nanti)
// window.printNotaToEpsonTMU220 = printNotaToEpsonTMU220;
// window.generateEscP = generateEscP;
