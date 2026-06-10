import type { VendorMappingInput } from '@/hooks/useSquarePrices';

export type ParsedVendorCatalogFile = {
  rows: VendorMappingInput[];
  totalRows: number;
  skippedRows: number;
  duplicateRows: number;
  conflictRows: number;
  vendorHeader: string;
  barcodeHeaders: string[];
};

function normalizeHeader(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function cellText(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const rich = value as { text?: unknown; result?: unknown; richText?: { text?: unknown }[] };
    if (rich.text != null) return cellText(rich.text);
    if (rich.result != null) return cellText(rich.result);
    if (Array.isArray(rich.richText)) return rich.richText.map(part => cellText(part.text)).join('');
  }
  return String(value).trim();
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (char === '\n') {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function vendorColumn(headers: string[]) {
  return headers.findIndex(header => {
    const normalized = normalizeHeader(header);
    return (
      normalized === 'vendor name' ||
      normalized === 'vendor' ||
      normalized === 'default vendor' ||
      normalized === 'supplier name' ||
      normalized === 'supplier' ||
      normalized === 'proveedor' ||
      normalized === 'nombre proveedor'
    );
  });
}

function barcodeColumns(headers: string[]) {
  const allowed = new Set([
    'barcode',
    'bar code',
    'sku',
    'upc',
    'gtin',
    'item sku',
    'variation sku',
    'item barcode',
    'variation barcode',
  ]);

  return headers
    .map((header, index) => ({ header, index, normalized: normalizeHeader(header) }))
    .filter(column => allowed.has(column.normalized))
    .map(column => column.index);
}

function rowsFromTable(table: string[][]): ParsedVendorCatalogFile | null {
  for (let headerIndex = 0; headerIndex < Math.min(table.length, 10); headerIndex += 1) {
    const headers = table[headerIndex] || [];
    const vendorIndex = vendorColumn(headers);
    const barcodeIndexes = barcodeColumns(headers);
    if (vendorIndex < 0 || barcodeIndexes.length === 0) continue;

    const mappings = new Map<string, string>();
    let totalRows = 0;
    let skippedRows = 0;
    let duplicateRows = 0;
    let conflictRows = 0;

    for (const row of table.slice(headerIndex + 1)) {
      totalRows += 1;
      const vendorName = cellText(row[vendorIndex]);
      const barcodes = barcodeIndexes
        .map(index => cellText(row[index]))
        .map(value => value.trim())
        .filter(Boolean);

      if (!vendorName || barcodes.length === 0) {
        skippedRows += 1;
        continue;
      }

      for (const barcode of [...new Set(barcodes)]) {
        const previous = mappings.get(barcode);
        if (previous) {
          duplicateRows += 1;
          if (previous.toLowerCase() !== vendorName.toLowerCase()) conflictRows += 1;
        }
        mappings.set(barcode, vendorName);
      }
    }

    return {
      rows: [...mappings.entries()].map(([barcode, vendorName]) => ({ barcode, vendorName })),
      totalRows,
      skippedRows,
      duplicateRows,
      conflictRows,
      vendorHeader: headers[vendorIndex] || 'Vendor Name',
      barcodeHeaders: barcodeIndexes.map(index => headers[index] || `Column ${index + 1}`),
    };
  }

  return null;
}

function readTextFile(file: File) {
  if (typeof file.text === 'function') return file.text();

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read file.'));
    reader.readAsText(file);
  });
}

async function parseXlsx(file: File) {
  const ExcelJSRuntime = await import('exceljs');
  const workbook = new ExcelJSRuntime.default.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  for (const sheet of workbook.worksheets) {
    const table: string[][] = [];
    sheet.eachRow(row => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      table.push(values.map(cellText));
    });

    const parsed = rowsFromTable(table);
    if (parsed) return parsed;
  }

  return null;
}

export async function parseSquareVendorCatalogFile(file: File) {
  const lowerName = file.name.toLowerCase();
  const parsed = lowerName.endsWith('.xlsx')
    ? await parseXlsx(file)
    : rowsFromTable(parseCsv(await readTextFile(file)));

  if (!parsed) {
    throw new Error('The catalog needs Vendor Name and at least one SKU, GTIN, UPC, or Barcode column.');
  }

  return parsed;
}
