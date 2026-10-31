/**
 * Utility for Thermal ESC/POS Receipt Printing via Bluetooth & RawBT
 * Supports Epson TM series, generic 58mm/80mm Bluetooth mobile printers.
 */

export interface ReceiptData {
  invoice_number: string;
  order_date?: string;
  date?: string;
  customer_name: string;
  sales_name?: string;
  product_name?: string;
  quantity?: number;
  unit?: string;
  unit_price?: number;
  price?: number;
  total_amount?: number;
  total?: number;
  payment_type?: string;
  status?: string;
  due_date?: string | null;
  items?: Array<{
    name?: string;
    product_name?: string;
    quantity: number;
    unit?: string;
    price?: number;
    unit_price?: number;
    subtotal?: number;
  }>;
}

/**
 * Format string row with left text and right text aligned (e.g. 32 chars wide for 58mm / 42 for 80mm)
 */
function formatTwoColumns(left: string, right: string, width = 32): string {
  const leftTrimmed = left.substring(0, Math.max(0, width - right.length - 1));
  const spacesNeeded = Math.max(1, width - leftTrimmed.length - right.length);
  return leftTrimmed + ' '.repeat(spacesNeeded) + right + '\n';
}

/**
 * Generate ESC/POS byte buffer for thermal printer
 * Matched 100% with the Visual JPG / WhatsApp receipt layout
 */
export function buildEscPosBytes(data: ReceiptData, paperWidth: 58 | 80 = 58): Uint8Array {
  const colWidth = paperWidth === 80 ? 42 : 32;
  const doubleLine = '='.repeat(colWidth) + '\n';
  const singleLine = '-'.repeat(colWidth) + '\n';

  // ESC/POS Command Constants
  const ESC = 0x1b;
  const GS = 0x1d;

  const encoder = new TextEncoder();
  const parts: (number[] | Uint8Array)[] = [];

  // Init printer: ESC @
  parts.push([ESC, 0x40]);

  // Center align: ESC a 1
  parts.push([ESC, 0x61, 0x01]);

  // Header Title: Double Height & Bold
  parts.push([ESC, 0x21, 0x10]); // double height
  parts.push(encoder.encode('DEWATA JAYA SUPPLIER\n'));

  // Normal font: ESC ! 0x00
  parts.push([ESC, 0x21, 0x00]);
  parts.push(encoder.encode('Distribusi Telur Segar Berkualitas\n'));
  parts.push(encoder.encode('Telp / WA: +62 823-3903-3923\n'));
  parts.push(encoder.encode(doubleLine));

  // Left align: ESC a 0
  parts.push([ESC, 0x61, 0x00]);

  const invNo = data.invoice_number || 'INV-001';
  let tgl = data.order_date || data.date || '';
  if (tgl && tgl.includes('T')) {
    tgl = tgl.split('T')[0];
  }
  if (!tgl) {
    tgl = new Date().toLocaleDateString('id-ID');
  }

  const cust = data.customer_name || 'Pelanggan';
  const sales = data.sales_name || 'Sales DJS';
  const rawStatus = (data.payment_type || data.status || 'LUNAS').toUpperCase();
  const isLunas = rawStatus.includes('LUNAS');
  const statusLabel = isLunas ? 'LUNAS (CASH/TF)' : 'PENDING (TEMPO)';

  parts.push(encoder.encode(formatTwoColumns('No. Nota :', invNo, colWidth)));
  parts.push(encoder.encode(formatTwoColumns('Tanggal  :', tgl, colWidth)));
  parts.push(encoder.encode(formatTwoColumns('Sales    :', sales, colWidth)));
  parts.push(encoder.encode(formatTwoColumns('Customer :', cust, colWidth)));
  parts.push(encoder.encode(formatTwoColumns('Tipe TOP :', statusLabel, colWidth)));

  if (!isLunas && data.due_date) {
    const dueStr = String(data.due_date).split('T')[0];
    parts.push(encoder.encode(formatTwoColumns('Tempo s/d:', dueStr, colWidth)));
  }

  parts.push(encoder.encode(singleLine));

  // Rincian Produk / Items
  let grandTotal = Number(data.total_amount || data.total || 0);

  if (data.items && data.items.length > 0) {
    for (const it of data.items) {
      const pName = it.name || it.product_name || 'Telur Ayam';
      const q = Number(it.quantity || 0);
      const u = it.unit || 'krat';
      const pr = Number(it.price || it.unit_price || 0);
      const sub = Number(it.subtotal || q * pr);
      parts.push(encoder.encode(`${pName}\n`));
      const leftStr = `  ${q} ${u} x Rp ${pr.toLocaleString('id-ID')}`;
      const rightStr = `Rp ${sub.toLocaleString('id-ID')}`;
      parts.push(encoder.encode(formatTwoColumns(leftStr, rightStr, colWidth)));
    }
  } else {
    const pName = data.product_name || 'Telur Ayam Ras';
    const q = Number(data.quantity || 0);
    const u = data.unit || 'krat';
    const pr = Number(data.unit_price || data.price || 0);
    const tot = grandTotal || q * pr;
    parts.push(encoder.encode(`${pName}\n`));
    const leftStr = `  ${q} ${u} x Rp ${pr.toLocaleString('id-ID')}`;
    const rightStr = `Rp ${tot.toLocaleString('id-ID')}`;
    parts.push(encoder.encode(formatTwoColumns(leftStr, rightStr, colWidth)));
  }

  parts.push(encoder.encode(singleLine));

  // Total Section (Bold)
  parts.push([ESC, 0x45, 0x01]); // Bold ON
  parts.push(encoder.encode(formatTwoColumns('TOTAL NOTA   :', `Rp ${grandTotal.toLocaleString('id-ID')}`, colWidth)));
  parts.push(encoder.encode(formatTwoColumns('STATUS BAYAR :', isLunas ? 'LUNAS' : 'BELUM LUNAS', colWidth)));
  parts.push([ESC, 0x45, 0x00]); // Bold OFF

  parts.push(encoder.encode(doubleLine));

  // Info Transfer Rekening Bank BCA
  parts.push([ESC, 0x61, 0x01]); // Center
  parts.push(encoder.encode('Pembayaran Transfer Bank BCA:\n'));
  parts.push([ESC, 0x45, 0x01]); // Bold ON
  parts.push(encoder.encode('1468924624 (Dewata Jaya Supplier)\n'));
  parts.push([ESC, 0x45, 0x00]); // Bold OFF

  parts.push(encoder.encode(singleLine));
  parts.push(encoder.encode('Simpan nota sbg bukti transaksi sah.\n'));
  parts.push(encoder.encode('Terima Kasih Atas Kepercayaannya! 🙏\n'));
  parts.push(encoder.encode(singleLine));

  // Tanda Tangan 2 Kolom: Penerima vs Hormat Kami
  parts.push([ESC, 0x61, 0x00]); // Left
  if (colWidth >= 42) {
    parts.push(encoder.encode('   Penerima / Toko             Hormat Kami     \n\n\n\n'));
    parts.push(encoder.encode(' ( ................... )     ( DJS Farmindo )  \n'));
  } else {
    parts.push(encoder.encode('  Penerima,         Hormat Kami,\n\n\n'));
    parts.push(encoder.encode('( ........... )   ( DJS Farmindo )\n'));
  }

  parts.push(encoder.encode('\n\n\n'));

  // Paper cut command: GS V 0x41 0x03
  parts.push([GS, 0x56, 0x41, 0x03]);

  // Combine into single Uint8Array
  let totalLen = 0;
  for (const p of parts) totalLen += p.length;
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of parts) {
    result.set(p, offset);
    offset += p.length;
  }

  return result;
}

/**
 * Direct Print to Bluetooth Thermal Printer using Web Bluetooth API
 */
export async function printDirectWebBluetooth(data: ReceiptData, paperWidth: 58 | 80 = 58): Promise<void> {
  const nav = navigator as any;
  if (!nav.bluetooth) {
    throw new Error('Browser ini belum mendukung Web Bluetooth. Buka web ini di Google Chrome (Android / PC).');
  }

  const device = await nav.bluetooth.requestDevice({
    filters: [
      { namePrefix: 'RP' },
      { namePrefix: 'MTP' },
      { namePrefix: 'POS' },
      { namePrefix: 'EP' },
      { namePrefix: 'TM' },
      { namePrefix: 'Bluetooth' },
      { namePrefix: 'BT' },
    ],
    optionalServices: [
      '000018f0-0000-1000-8000-00805f9b34fb',
      'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
      '49535343-fe7d-4ae5-8fa9-9fafd205e455',
      0xffe0,
      0xfff0,
    ],
    acceptAllDevices: false,
  }).catch(() => {
    return nav.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [
        '000018f0-0000-1000-8000-00805f9b34fb',
        'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
        '49535343-fe7d-4ae5-8fa9-9fafd205e455',
        0xffe0,
        0xfff0,
      ],
    });
  });

  if (!device || !device.gatt) {
    throw new Error('Koneksi Bluetooth dibatalkan');
  }

  const server = await device.gatt.connect();
  const services = await server.getPrimaryServices();
  let writeChar: any = null;

  for (const service of services) {
    try {
      const chars = await service.getCharacteristics();
      for (const c of chars) {
        if (c.properties.write || c.properties.writeWithoutResponse) {
          writeChar = c;
          break;
        }
      }
      if (writeChar) break;
    } catch (e) {}
  }

  if (!writeChar) {
    server.disconnect();
    throw new Error('Tidak ditemukan port print pada printer Bluetooth ini.');
  }

  const bytes = buildEscPosBytes(data, paperWidth);
  const chunkSize = 128;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    if (writeChar.writeValueWithResponse) {
      await writeChar.writeValueWithResponse(chunk);
    } else {
      await writeChar.writeValueWithoutResponse(chunk);
    }
  }

  setTimeout(() => {
    try {
      server.disconnect();
    } catch (e) {}
  }, 1000);
}

/**
 * Print via RawBT app on Android (1-click printing over Bluetooth/USB without dialog)
 */
export function printViaRawBT(data: ReceiptData, paperWidth: 58 | 80 = 58): void {
  const bytes = buildEscPosBytes(data, paperWidth);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64Data = btoa(binary);

  const rawbtUrl = `rawbt:base64,${base64Data}`;
  window.location.href = rawbtUrl;
}
