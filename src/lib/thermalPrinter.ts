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
  product_name: string;
  quantity: number;
  unit?: string;
  unit_price: number;
  total_amount: number;
  payment_type?: string;
  status?: string;
}

/**
 * Format string row with left text and right text aligned (e.g. 32 chars wide for 58mm / 42 for 80mm)
 */
function formatTwoColumns(left: string, right: string, width = 32): string {
  const leftTrimmed = left.substring(0, width - right.length - 1);
  const spacesNeeded = Math.max(1, width - leftTrimmed.length - right.length);
  return leftTrimmed + ' '.repeat(spacesNeeded) + right + '\n';
}

/**
 * Generate ESC/POS byte buffer for thermal printer
 */
export function buildEscPosBytes(data: ReceiptData, paperWidth: 58 | 80 = 58): Uint8Array {
  const colWidth = paperWidth === 80 ? 42 : 32;
  const line = '-'.repeat(colWidth) + '\n';

  // ESC/POS Command Constants
  const ESC = 0x1b;
  const GS = 0x1d;

  const encoder = new TextEncoder();
  const parts: (number[] | Uint8Array)[] = [];

  // Init printer: ESC @
  parts.push([ESC, 0x40]);

  // Center align: ESC a 1
  parts.push([ESC, 0x61, 0x01]);

  // Double height & bold for title: ESC ! 0x10
  parts.push([ESC, 0x21, 0x10]);
  parts.push(encoder.encode('DEWATA JAYA SUPPLIER\n'));

  // Normal font: ESC ! 0x00
  parts.push([ESC, 0x21, 0x00]);
  parts.push(encoder.encode('Sistem Distribusi Telur\n'));
  parts.push(encoder.encode('Telp/WA: +62 823-3903-3923\n'));
  parts.push(encoder.encode(line));

  // Left align: ESC a 0
  parts.push([ESC, 0x61, 0x00]);

  const invNo = data.invoice_number || 'INV-001';
  const tgl = data.order_date || data.date || new Date().toLocaleDateString('id-ID');
  const cust = data.customer_name || 'Pelanggan';
  const sales = data.sales_name || 'Sales DJS';
  const status = (data.payment_type || data.status || 'LUNAS').toUpperCase();

  parts.push(encoder.encode(formatTwoColumns('No. Nota :', invNo, colWidth)));
  parts.push(encoder.encode(formatTwoColumns('Tanggal  :', tgl, colWidth)));
  parts.push(encoder.encode(formatTwoColumns('Customer :', cust, colWidth)));
  parts.push(encoder.encode(formatTwoColumns('Sales    :', sales, colWidth)));
  parts.push(encoder.encode(line));

  // Items
  const prodName = data.product_name || 'Telur Ayam Ras';
  const qty = Number(data.quantity || 0);
  const unit = data.unit || 'krat';
  const price = Number(data.unit_price || 0);
  const total = Number(data.total_amount || 0);

  parts.push(encoder.encode(`${prodName}\n`));
  const qtyPriceStr = `${qty} ${unit} x Rp ${price.toLocaleString('id-ID')}`;
  const totalStr = `Rp ${total.toLocaleString('id-ID')}`;
  parts.push(encoder.encode(formatTwoColumns(qtyPriceStr, totalStr, colWidth)));
  parts.push(encoder.encode(line));

  // Grand Total (Bold)
  parts.push([ESC, 0x45, 0x01]); // Bold ON
  parts.push(encoder.encode(formatTwoColumns('TOTAL :', totalStr, colWidth)));
  parts.push(encoder.encode(formatTwoColumns('STATUS:', status, colWidth)));
  parts.push([ESC, 0x45, 0x00]); // Bold OFF

  parts.push(encoder.encode(line));

  // Center align footer
  parts.push([ESC, 0x61, 0x01]);
  parts.push(encoder.encode('Terima kasih atas kerja samanya\n'));
  parts.push(encoder.encode('Simpan struk ini sbg bukti sah\n\n\n'));

  // Paper cut command: GS V 0x41 0x03
  parts.push([GS, 0x56, 0x41, 0x03]);

  // Combine parts into single Uint8Array
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
 * Works on Google Chrome Android, Edge, and Desktop with Bluetooth.
 */
export async function printDirectWebBluetooth(data: ReceiptData, paperWidth: 58 | 80 = 58): Promise<void> {
  const nav = navigator as any;
  if (!nav.bluetooth) {
    throw new Error('Browser ini belum mendukung Web Bluetooth. Buka web ini di Google Chrome (Android / PC).');
  }

  // Request Bluetooth Device
  // Commonly used service UUIDs for thermal ESC/POS printers
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
      '000018f0-0000-1000-8000-00805f9b34fb', // Standard POS Service
      'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Generic thermal printer service
      '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Bluetooth Serial
      0xffe0, // CC2540 serial
      0xfff0,
    ],
    acceptAllDevices: false,
  }).catch(() => {
    // If name filter didn't catch, fallback to show all devices
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

  // Find printer primary service & characteristic
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
    } catch (e) {
      // Continue search
    }
  }

  if (!writeChar) {
    server.disconnect();
    throw new Error('Tidak ditemukan port print pada printer Bluetooth ini.');
  }

  // Send bytes in chunks of 512 bytes
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

  // Brief pause then disconnect
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

  // RawBT Intent URL scheme
  const rawbtUrl = `rawbt:base64,${base64Data}`;
  window.location.href = rawbtUrl;
}

