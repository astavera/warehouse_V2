import type ExcelJS from 'exceljs';
import {
  finalAmountToPay,
  findTruckDuplicateGroups,
  normalizeText,
  parseMoney,
  parsePaidStatus,
  sourceRowHash,
  toIsoDate,
  truckDuplicateGroupKey,
} from '@/lib/accounting';

export const ACCOUNTING_TEMPLATE_SHEETS = [
  'Instructions',
  'Vendors',
  'Credit Cards',
  'Pending Invoices',
  'Paid Invoices',
  'Credit Card Payments',
  'Personal Bills',
  'Truck',
] as const;

export type AccountingTemplateVendor = {
  account_number: string | null;
  address: string | null;
  contact_name: string | null;
  default_payment_method_name: string | null;
  email: string | null;
  name: string;
  notes: string | null;
  phone: string | null;
  rowNumber: number;
};

export type AccountingTemplateAccount = {
  account_type: string;
  active: boolean;
  brand: string | null;
  last_four: string | null;
  name: string;
  rowNumber: number;
  store_name: string | null;
};

export type AccountingTemplateInvoice = {
  amount: string | null;
  batch_number: string | null;
  category_name: string | null;
  cloud: string | null;
  credit: string;
  credit_reason: string | null;
  due_date: string | null;
  invoice_number: string | null;
  issue_date: string | null;
  notes: string | null;
  order_number: string | null;
  paid: boolean;
  rowNumber: number;
  status: 'pending' | 'paid' | 'cancelled' | 'unknown';
  store_name: string | null;
  vendor_name: string;
};

export type AccountingTemplateInvoicePayment = {
  account_name: string | null;
  account_number: string | null;
  amount_paid: string | null;
  category_name: string | null;
  check_number: string | null;
  invoice_number: string | null;
  notes: string | null;
  payment_date: string | null;
  payment_method_name: string | null;
  reference_number: string | null;
  rowNumber: number;
  status: string;
  store_name: string | null;
  vendor_name: string;
};

export type AccountingTemplateCreditCardPayment = {
  account_name: string | null;
  amount: string | null;
  confirmation_number: string | null;
  notes: string | null;
  payment_date: string | null;
  rowNumber: number;
  status: string | null;
};

export type AccountingTemplatePersonalBill = {
  amount: string | null;
  bill_name: string | null;
  notes: string | null;
  payer: string | null;
  payment_date: string | null;
  payment_method_name: string | null;
  rowNumber: number;
  status: string | null;
  vendor_name: string | null;
};

export type AccountingTemplateTruckViolation = {
  amount: string | null;
  description: string | null;
  notes: string | null;
  paid_amount: string | null;
  payment_date: string | null;
  payment_method: string | null;
  receipt_number: string | null;
  rowNumber: number;
  violation_date: string | null;
  violation_number: string | null;
};

export type AccountingTemplateWarning = {
  code: string;
  message: string;
  raw_payload: Record<string, unknown>;
  severity: string;
  source_file_name: string;
  source_row: number | null;
  source_sheet: string;
};

export type AccountingTemplateImport = {
  accounts: AccountingTemplateAccount[];
  creditCardPayments: AccountingTemplateCreditCardPayment[];
  fileName: string;
  fileSha256: string;
  invoices: AccountingTemplateInvoice[];
  payments: AccountingTemplateInvoicePayment[];
  personalBills: AccountingTemplatePersonalBill[];
  sheetsProcessed: Array<{ name: string; rowsProcessed: number }>;
  truckViolations: AccountingTemplateTruckViolation[];
  vendors: AccountingTemplateVendor[];
  warnings: AccountingTemplateWarning[];
};

const SHEET_HEADERS: Record<string, string[]> = {
  Vendors: ['Vendor Name', 'Address', 'Contact Name', 'Phone Number', 'Email', 'Account Number', 'Default Payment Method', 'Notes'],
  'Credit Cards': ['Card Name', 'Store', 'Brand / Bank', 'Last 4', 'Active'],
  'Pending Invoices': [
    'Vendor Name',
    'Store',
    'Invoice Number',
    'Order Number',
    'Batch Number',
    'Cloud',
    'Due Date',
    'Issue Date',
    'Amount',
    'Credit Amount',
    'Credit Reason',
    'Category',
    'Notes',
    'Status',
  ],
  'Paid Invoices': [
    'Vendor Name',
    'Store',
    'Invoice Number(s)',
    'Payment Date',
    'Amount Paid',
    'Payment Method',
    'Credit Card / Account',
    'Vendor Account Number',
    'Check Number(s)',
    'Reference / Confirmation',
    'Category',
    'Notes',
    'Status',
  ],
  'Credit Card Payments': ['Credit Card', 'Payment Date', 'Amount', 'Confirmation / Reference', 'Status', 'Notes'],
  'Personal Bills': ['Bill Name', 'Vendor Name', 'Payer', 'Payment Method', 'Payment Date', 'Amount', 'Status', 'Notes'],
  Truck: ['Violation Number', 'Violation Date', 'Description', 'Amount', 'Receipt / Reference', 'Payment Method', 'Paid Amount', 'Payment Date', 'Notes'],
};

const TEMPLATE_SAMPLE_ROWS: Record<string, unknown[][]> = {
  Vendors: [['Example Vendor', '123 Main St', 'Accounts Receivable', '555-0101', 'ar@example.com', 'ACCT-123', 'Check', 'Optional notes']],
  'Credit Cards': [['TD Business 7627', 'Both Stores', 'TD', '7627', 'Yes']],
  'Pending Invoices': [['Example Vendor', 'Warehouse', 'INV-1001', 'PO-1001', '', '', '2026-07-15', '2026-06-30', 1250.5, 50, 'Damaged item credit', 'Freight', 'Pay before due date', 'pending']],
  'Paid Invoices': [['Example Vendor', 'Warehouse', 'INV-1001\nINV-1002', '2026-07-01', 1800, 'Credit Card', 'TD Business 7627', 'ACCT-123', '', 'CONF-123', 'Freight', 'One combined payment row', 'Paid']],
  'Credit Card Payments': [['TD Business 7627', '2026-07-05', 1800, 'CONF-123', 'Paid', 'Statement payment']],
  'Personal Bills': [['Directv', 'Example Vendor', 'Sebastian', 'Credit Card', '2026-07-06', 50.44, 'Paid', 'Optional notes']],
  Truck: [['925661674-9', '2026-07-07', 'Double parking', 115, 'CPY052894306', 'eCheck 1648', 115, '2026-07-15', 'Optional notes']],
};

function cellText(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('result' in value && (value as { result?: unknown }).result != null) return cellText((value as { result: unknown }).result);
    if ('text' in value && (value as { text?: unknown }).text != null) return cellText((value as { text: unknown }).text);
    if ('richText' in value && Array.isArray((value as { richText?: Array<{ text?: string }> }).richText)) {
      return ((value as { richText: Array<{ text?: string }> }).richText).map(part => part.text || '').join('').trim() || null;
    }
    return JSON.stringify(value);
  }
  const text = String(value).trim();
  return text ? text : null;
}

function rowValue(row: ExcelJS.Row, headerMap: Map<string, number>, header: string) {
  const column = headerMap.get(normalizeText(header));
  return column ? cellText(row.getCell(column).value) : null;
}

function moneyValue(row: ExcelJS.Row, headerMap: Map<string, number>, header: string) {
  return parseMoney(rowValue(row, headerMap, header));
}

function dateValue(row: ExcelJS.Row, headerMap: Map<string, number>, header: string) {
  return toIsoDate(rowValue(row, headerMap, header));
}

function boolValue(value: string | null | undefined, defaultValue = true) {
  if (!value) return defaultValue;
  const normalized = normalizeText(value);
  if (['yes', 'y', 'true', '1', 'active'].includes(normalized)) return true;
  if (['no', 'n', 'false', '0', 'inactive'].includes(normalized)) return false;
  return defaultValue;
}

function hasAnyValue(row: ExcelJS.Row, maxColumn: number) {
  for (let column = 1; column <= maxColumn; column += 1) {
    if (cellText(row.getCell(column).value)) return true;
  }
  return false;
}

function headerMapFor(sheet: ExcelJS.Worksheet) {
  const headerRow = sheet.getRow(1);
  const map = new Map<string, number>();
  for (let column = 1; column <= sheet.columnCount; column += 1) {
    const header = cellText(headerRow.getCell(column).value);
    if (header) map.set(normalizeText(header), column);
  }
  return map;
}

function sheetByName(workbook: ExcelJS.Workbook, name: string) {
  return workbook.worksheets.find(sheet => normalizeText(sheet.name) === normalizeText(name));
}

function rawPayload(row: ExcelJS.Row, headers: string[], headerMap: Map<string, number>) {
  return Object.fromEntries(headers.map(header => [header, rowValue(row, headerMap, header)]));
}

function addWarning(
  warnings: AccountingTemplateWarning[],
  fileName: string,
  sourceSheet: string,
  sourceRow: number | null,
  code: string,
  message: string,
  raw: Record<string, unknown> = {},
  severity = 'warning'
) {
  warnings.push({ code, message, raw_payload: raw, severity, source_file_name: fileName, source_row: sourceRow, source_sheet: sourceSheet });
}

async function sha256Hex(file: File) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function setupWorksheet(sheet: ExcelJS.Worksheet, headers: string[], sampleRows: unknown[][] = []) {
  sheet.columns = headers.map(header => ({ header, key: header, width: Math.max(16, Math.min(30, header.length + 4)) }));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F5F86' } };
  sheet.getRow(1).alignment = { vertical: 'middle', wrapText: true };
  sampleRows.forEach(row => sheet.addRow(row));
  sheet.eachRow(row => {
    row.eachCell(cell => {
      cell.border = {
        bottom: { color: { argb: 'FFE2E8F0' }, style: 'thin' },
        left: { color: { argb: 'FFE2E8F0' }, style: 'thin' },
        right: { color: { argb: 'FFE2E8F0' }, style: 'thin' },
        top: { color: { argb: 'FFE2E8F0' }, style: 'thin' },
      };
      cell.alignment = { vertical: 'top', wrapText: true };
    });
  });
}

export async function createAccountingTemplateBuffer() {
  const ExcelJSRuntime = await import('exceljs');
  const workbook = new ExcelJSRuntime.default.Workbook();
  workbook.creator = 'All Zentro Solutions';
  workbook.created = new Date();

  const instructions = workbook.addWorksheet('Instructions');
  instructions.columns = [{ header: 'Step', key: 'step', width: 28 }, { header: 'Details', key: 'details', width: 88 }];
  [
    ['1. Fill catalogs first', 'Add Vendors and Credit Cards once. The importer will match names automatically.'],
    ['2. Pending Invoices', 'Use one row per open invoice. Credit Amount and Credit Reason are optional.'],
    ['3. Paid Invoices', 'Use one row per payment. Store is optional. Invoice Number(s) can contain multiple invoice numbers separated by new lines.'],
    ['4. Dates and money', 'Use YYYY-MM-DD for dates and plain numbers for amounts. Example: 1250.50'],
    ['5. Import', 'Upload this file from Accounting > Imports. Rows are matched by file name, sheet, and row number.'],
  ].forEach(row => instructions.addRow(row));
  instructions.getRow(1).font = { bold: true };

  for (const [name, headers] of Object.entries(SHEET_HEADERS)) {
    setupWorksheet(workbook.addWorksheet(name), headers, TEMPLATE_SAMPLE_ROWS[name] || []);
  }

  return workbook.xlsx.writeBuffer();
}

export async function downloadAccountingImportTemplate() {
  const buffer = await createAccountingTemplateBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `all-zentro-accounting-template-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function parseAccountingTemplateFile(file: File): Promise<AccountingTemplateImport> {
  const [buffer, fileSha256] = await Promise.all([file.arrayBuffer(), sha256Hex(file)]);
  const ExcelJSRuntime = await import('exceljs');
  const workbook = new ExcelJSRuntime.default.Workbook();
  await workbook.xlsx.load(buffer);

  const result: AccountingTemplateImport = {
    accounts: [],
    creditCardPayments: [],
    fileName: file.name,
    fileSha256,
    invoices: [],
    payments: [],
    personalBills: [],
    sheetsProcessed: [],
    truckViolations: [],
    vendors: [],
    warnings: [],
  };

  for (const sheetName of ACCOUNTING_TEMPLATE_SHEETS.filter(name => name !== 'Instructions')) {
    const sheet = sheetByName(workbook, sheetName);
    if (!sheet) {
      addWarning(result.warnings, file.name, sheetName, null, 'sheet_missing', `Sheet "${sheetName}" was not found.`);
      continue;
    }
    const headers = SHEET_HEADERS[sheetName] || [];
    const headerMap = headerMapFor(sheet);
    let rowsProcessed = 0;

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      if (!hasAnyValue(row, headers.length)) continue;
      rowsProcessed += 1;
      const raw = rawPayload(row, headers, headerMap);

      if (sheetName === 'Vendors') {
        const name = rowValue(row, headerMap, 'Vendor Name');
        if (!name) {
          addWarning(result.warnings, file.name, sheetName, rowNumber, 'vendor_name_missing', 'Vendor row has no Vendor Name.', raw);
          continue;
        }
        result.vendors.push({
          account_number: rowValue(row, headerMap, 'Account Number'),
          address: rowValue(row, headerMap, 'Address'),
          contact_name: rowValue(row, headerMap, 'Contact Name'),
          default_payment_method_name: rowValue(row, headerMap, 'Default Payment Method'),
          email: rowValue(row, headerMap, 'Email'),
          name,
          notes: rowValue(row, headerMap, 'Notes'),
          phone: rowValue(row, headerMap, 'Phone Number'),
          rowNumber,
        });
      }

      if (sheetName === 'Credit Cards') {
        const name = rowValue(row, headerMap, 'Card Name');
        if (!name) {
          addWarning(result.warnings, file.name, sheetName, rowNumber, 'card_name_missing', 'Credit card row has no Card Name.', raw);
          continue;
        }
        result.accounts.push({
          account_type: 'credit_card',
          active: boolValue(rowValue(row, headerMap, 'Active'), true),
          brand: rowValue(row, headerMap, 'Brand / Bank'),
          last_four: rowValue(row, headerMap, 'Last 4'),
          name,
          rowNumber,
          store_name: rowValue(row, headerMap, 'Store'),
        });
      }

      if (sheetName === 'Pending Invoices') {
        const vendorName = rowValue(row, headerMap, 'Vendor Name');
        const amount = moneyValue(row, headerMap, 'Amount');
        if (!vendorName) {
          addWarning(result.warnings, file.name, sheetName, rowNumber, 'vendor_name_missing', 'Pending invoice row has no Vendor Name.', raw);
          continue;
        }
        if (!amount) addWarning(result.warnings, file.name, sheetName, rowNumber, 'invalid_amount', 'Pending invoice amount is empty or invalid.', raw);
        const status = parsePaidStatus(rowValue(row, headerMap, 'Status'));
        const credit = moneyValue(row, headerMap, 'Credit Amount') || '0.00';
        result.invoices.push({
          amount,
          batch_number: rowValue(row, headerMap, 'Batch Number'),
          category_name: rowValue(row, headerMap, 'Category'),
          cloud: rowValue(row, headerMap, 'Cloud'),
          credit,
          credit_reason: rowValue(row, headerMap, 'Credit Reason'),
          due_date: dateValue(row, headerMap, 'Due Date'),
          invoice_number: rowValue(row, headerMap, 'Invoice Number'),
          issue_date: dateValue(row, headerMap, 'Issue Date'),
          notes: rowValue(row, headerMap, 'Notes'),
          order_number: rowValue(row, headerMap, 'Order Number'),
          paid: status === 'paid',
          rowNumber,
          status,
          store_name: rowValue(row, headerMap, 'Store'),
          vendor_name: vendorName,
        });
      }

      if (sheetName === 'Paid Invoices') {
        const vendorName = rowValue(row, headerMap, 'Vendor Name');
        const amountPaid = moneyValue(row, headerMap, 'Amount Paid');
        if (!vendorName) {
          addWarning(result.warnings, file.name, sheetName, rowNumber, 'vendor_name_missing', 'Paid invoice row has no Vendor Name.', raw);
          continue;
        }
        if (!amountPaid) addWarning(result.warnings, file.name, sheetName, rowNumber, 'payment_without_amount', 'Paid invoice row has no valid Amount Paid.', raw);
        result.payments.push({
          account_name: rowValue(row, headerMap, 'Credit Card / Account'),
          account_number: rowValue(row, headerMap, 'Vendor Account Number'),
          amount_paid: amountPaid,
          category_name: rowValue(row, headerMap, 'Category'),
          check_number: rowValue(row, headerMap, 'Check Number(s)'),
          invoice_number: rowValue(row, headerMap, 'Invoice Number(s)'),
          notes: rowValue(row, headerMap, 'Notes'),
          payment_date: dateValue(row, headerMap, 'Payment Date'),
          payment_method_name: rowValue(row, headerMap, 'Payment Method') || 'Check',
          reference_number: rowValue(row, headerMap, 'Reference / Confirmation'),
          rowNumber,
          status: rowValue(row, headerMap, 'Status') || 'Paid',
          store_name: rowValue(row, headerMap, 'Store'),
          vendor_name: vendorName,
        });
      }

      if (sheetName === 'Credit Card Payments') {
        result.creditCardPayments.push({
          account_name: rowValue(row, headerMap, 'Credit Card'),
          amount: moneyValue(row, headerMap, 'Amount'),
          confirmation_number: rowValue(row, headerMap, 'Confirmation / Reference'),
          notes: rowValue(row, headerMap, 'Notes'),
          payment_date: dateValue(row, headerMap, 'Payment Date'),
          rowNumber,
          status: rowValue(row, headerMap, 'Status') || 'Paid',
        });
      }

      if (sheetName === 'Personal Bills') {
        result.personalBills.push({
          amount: moneyValue(row, headerMap, 'Amount'),
          bill_name: rowValue(row, headerMap, 'Bill Name'),
          notes: rowValue(row, headerMap, 'Notes'),
          payer: rowValue(row, headerMap, 'Payer'),
          payment_date: dateValue(row, headerMap, 'Payment Date'),
          payment_method_name: rowValue(row, headerMap, 'Payment Method'),
          rowNumber,
          status: rowValue(row, headerMap, 'Status') || 'Paid',
          vendor_name: rowValue(row, headerMap, 'Vendor Name'),
        });
      }

      if (sheetName === 'Truck') {
        result.truckViolations.push({
          amount: moneyValue(row, headerMap, 'Amount'),
          description: rowValue(row, headerMap, 'Description'),
          notes: rowValue(row, headerMap, 'Notes'),
          paid_amount: moneyValue(row, headerMap, 'Paid Amount'),
          payment_date: dateValue(row, headerMap, 'Payment Date'),
          payment_method: rowValue(row, headerMap, 'Payment Method'),
          receipt_number: rowValue(row, headerMap, 'Receipt / Reference'),
          rowNumber,
          violation_date: dateValue(row, headerMap, 'Violation Date'),
          violation_number: rowValue(row, headerMap, 'Violation Number'),
        });
      }
    }

    result.sheetsProcessed.push({ name: sheetName, rowsProcessed });
  }

  const duplicateTruckKeys = findTruckDuplicateGroups(result.truckViolations);
  for (const row of result.truckViolations) {
    const key = truckDuplicateGroupKey(row.violation_number);
    if (key && duplicateTruckKeys.has(key)) {
      addWarning(
        result.warnings,
        file.name,
        'Truck',
        row.rowNumber,
        'duplicate_truck_violation',
        `Possible duplicate truck violation "${row.violation_number}".`,
        row as unknown as Record<string, unknown>
      );
    }
  }

  return result;
}

export function accountingTemplateRowCounts(payload: AccountingTemplateImport) {
  return {
    accounts: payload.accounts.length,
    creditCardPayments: payload.creditCardPayments.length,
    invoices: payload.invoices.length,
    payments: payload.payments.length,
    personalBills: payload.personalBills.length,
    truckViolations: payload.truckViolations.length,
    vendors: payload.vendors.length,
    warnings: payload.warnings.length,
  };
}
