import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';
import {
  addCents,
  centsToDecimal,
  detectTruckDuplicateKeys,
  displayText,
  extractCellNote,
  finalAmountToPay,
  normalizeText,
  parseExcelDate,
  parseMoney,
  parseMoneyToCents,
  parsePaidStatus,
  sourceRowHash,
  sourceRowKey,
  truckDuplicateGroupKey,
} from './accounting-import-utils.mjs';

const DEFAULT_EXCEL_PATH = 'data/_Modern State 2026 (1).xlsx';
const REPORT_PATH = 'reports/excel_import_reconciliation.md';
const REQUIRED_SHEETS = [
  'General Info',
  'Pending Invoices',
  'Paid Invoices',
  'Credit Card Payments',
  'Personal Bills',
  'Truck',
];

function loadDotEnv(fileName = '.env') {
  return fs.readFile(fileName, 'utf8')
    .then(text => {
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const [key, ...valueParts] = trimmed.split('=');
        if (process.env[key]) continue;
        process.env[key] = valueParts.join('=').replace(/^["']|["']$/g, '');
      }
    })
    .catch(() => {});
}

function getArg(name) {
  const prefix = `${name}=`;
  const arg = process.argv.find(item => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function nowIso() {
  return new Date().toISOString();
}

function sheetByTrimmedName(workbook, wanted) {
  return workbook.worksheets.find(sheet => normalizeText(sheet.name) === normalizeText(wanted));
}

function rowHasAnyValue(row, columns) {
  return columns.some(column => displayText(row.getCell(column).value) != null);
}

function headersFor(sheet, headerRowNumber) {
  const row = sheet.getRow(headerRowNumber);
  const headers = [];
  for (let column = 1; column <= sheet.columnCount; column += 1) {
    const header = displayText(row.getCell(column).value);
    if (header) headers.push({ column, header });
  }
  return headers;
}

function rawPayloadFor(sheet, headerRowNumber, rowNumber) {
  const headers = headersFor(sheet, headerRowNumber);
  const row = sheet.getRow(rowNumber);
  const payload = {};
  const comments = {};
  for (const { column, header } of headers) {
    const key = header || `Column ${column}`;
    const cell = row.getCell(column);
    payload[key] = displayText(cell.value);
    const note = extractCellNote(cell);
    if (note) comments[key] = note;
  }
  if (Object.keys(comments).length > 0) payload.__comments = comments;
  return payload;
}

function text(row, column) {
  return displayText(row.getCell(column).value);
}

function money(row, column) {
  return parseMoney(row.getCell(column).value);
}

function moneyOrZero(row, column) {
  return money(row, column) || '0.00';
}

function date(row, column) {
  return parseExcelDate(row.getCell(column).value);
}

function addCatalog(map, name, extra = {}) {
  const clean = displayText(name);
  if (!clean) return null;
  const normalized = normalizeText(clean);
  if (!normalized) return null;
  if (!map.has(normalized)) {
    map.set(normalized, {
      id: null,
      name: clean,
      normalized_name: normalized,
      ...extra,
    });
  }
  return normalized;
}

function makeWarning(warnings, sourceFileName, sourceSheet, sourceRow, code, message, rawPayload = {}, severity = 'warning') {
  warnings.push({
    source_file_name: sourceFileName,
    source_sheet: sourceSheet,
    source_row: sourceRow,
    severity,
    code,
    message,
    raw_payload: rawPayload,
  });
}

function compactPayload(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value != null && value !== ''));
}

function parseWorkbook(workbook, sourceFileName, sourceFileSha256) {
  const warnings = [];
  const catalogs = {
    vendors: new Map(),
    stores: new Map(),
    accounts: new Map(),
    paymentMethods: new Map(),
    categories: new Map(),
  };
  const sheets = {};
  const invoices = [];
  const payments = [];
  const creditCardPayments = [];
  const personalBills = [];
  const truckViolations = [];
  const sheetsFound = workbook.worksheets.map(sheet => sheet.name);

  for (const required of REQUIRED_SHEETS) {
    const sheet = sheetByTrimmedName(workbook, required);
    if (!sheet) {
      makeWarning(warnings, sourceFileName, required, null, 'sheet_missing', `Required sheet "${required}" was not found.`, {});
    }
  }

  const generalInfo = sheetByTrimmedName(workbook, 'General Info');
  if (generalInfo) {
    sheets['General Info'] = {
      headers: headersFor(generalInfo, 3),
      rowsProcessed: 0,
    };
    for (let rowNumber = 4; rowNumber <= generalInfo.rowCount; rowNumber += 1) {
      const row = generalInfo.getRow(rowNumber);
      const cardName = text(row, 1);
      if (cardName && !['accounts td bk'].includes(normalizeText(cardName))) {
        addCatalog(catalogs.accounts, cardName, { account_type: 'credit_card', raw_payload: rawPayloadFor(generalInfo, 3, rowNumber) });
        sheets['General Info'].rowsProcessed += 1;
      }
      const bankAccount = text(row, 1);
      const bankName = text(row, 2);
      if (/^\d{3,4}$/.test(bankAccount || '') && bankName) {
        addCatalog(catalogs.accounts, `${bankName} ${bankAccount}`, {
          account_type: 'bank',
          last_four: bankAccount,
          raw_payload: rawPayloadFor(generalInfo, 3, rowNumber),
        });
      }
      const vendor = text(row, 4);
      if (vendor) addCatalog(catalogs.vendors, vendor, { source: 'General Info', raw_payload: rawPayloadFor(generalInfo, 3, rowNumber) });
    }
  }

  const pending = sheetByTrimmedName(workbook, 'Pending Invoices');
  if (pending) {
    sheets['Pending Invoices'] = {
      headers: headersFor(pending, 1),
      rowsProcessed: 0,
    };
    for (let rowNumber = 2; rowNumber <= pending.rowCount; rowNumber += 1) {
      const row = pending.getRow(rowNumber);
      if (!rowHasAnyValue(row, [1, 2, 3, 7, 8, 9, 10, 12, 13])) continue;
      const rawPayload = rawPayloadFor(pending, 1, rowNumber);
      const vendorName = text(row, 1);
      if (!vendorName) continue;
      const storeName = text(row, 2);
      const invoiceNumber = text(row, 3);
      const amount = money(row, 9);
      const credit = moneyOrZero(row, 10);
      const paidStatus = parsePaidStatus(row.getCell(13).value);
      const status = paidStatus === 'paid' ? 'paid' : paidStatus === 'cancelled' ? 'cancelled' : 'pending';
      const notes = text(row, 12);
      const comments = Object.values(rawPayload.__comments || {}).join('\n') || null;

      if (!invoiceNumber) makeWarning(warnings, sourceFileName, pending.name, rowNumber, 'invoice_number_missing', 'Pending invoice row has no invoice number.', rawPayload);
      if (amount == null) makeWarning(warnings, sourceFileName, pending.name, rowNumber, 'invalid_amount', 'Pending invoice amount is empty or invalid.', rawPayload);
      if (date(row, 7) == null && text(row, 7)) makeWarning(warnings, sourceFileName, pending.name, rowNumber, 'invalid_due_date', 'Pending invoice due date could not be parsed.', rawPayload);
      if (date(row, 8) == null && text(row, 8)) makeWarning(warnings, sourceFileName, pending.name, rowNumber, 'invalid_issue_date', 'Pending invoice issue date could not be parsed.', rawPayload);

      const vendorKey = addCatalog(catalogs.vendors, vendorName, { source: 'Pending Invoices', raw_payload: { name: vendorName } });
      const storeKey = addCatalog(catalogs.stores, storeName);
      const categoryKey = addCatalog(catalogs.categories, notes);
      const payload = compactPayload({
        vendor: vendorName,
        store: storeName,
        invoice_number: invoiceNumber,
        order_number: text(row, 4),
        batch_number: text(row, 5),
        cloud: text(row, 6),
        due_date: date(row, 7),
        issue_date: date(row, 8),
        amount,
        credit,
        final_amount_to_pay: finalAmountToPay(amount, credit),
        notes,
        status,
        paid: status === 'paid',
      });

      invoices.push({
        vendor_key: vendorKey,
        store_key: storeKey,
        category_key: categoryKey,
        vendor_id: null,
        store_id: null,
        invoice_number: invoiceNumber,
        order_number: text(row, 4),
        issue_date: date(row, 8),
        due_date: date(row, 7),
        amount,
        credit,
        status,
        paid: status === 'paid',
        category_id: null,
        batch_number: text(row, 5),
        cloud: text(row, 6),
        notes,
        excel_comments: comments,
        source_file_name: sourceFileName,
        source_file_sha256: sourceFileSha256,
        source_sheet: pending.name.trim(),
        source_row: rowNumber,
        source_row_hash: sourceRowHash(payload),
        import_batch_id: null,
        raw_payload: rawPayload,
      });
      sheets['Pending Invoices'].rowsProcessed += 1;
    }
  }

  const paid = sheetByTrimmedName(workbook, 'Paid Invoices');
  if (paid) {
    sheets['Paid Invoices'] = {
      headers: headersFor(paid, 1),
      rowsProcessed: 0,
    };
    for (let rowNumber = 2; rowNumber <= paid.rowCount; rowNumber += 1) {
      const row = paid.getRow(rowNumber);
      if (!rowHasAnyValue(row, [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 13])) continue;
      const rawPayload = rawPayloadFor(paid, 1, rowNumber);
      const vendorName = text(row, 3);
      if (!vendorName) continue;
      const amountPaid = money(row, 10);
      if (amountPaid == null) makeWarning(warnings, sourceFileName, paid.name, rowNumber, 'payment_without_amount', 'Paid invoice row has no valid amount paid.', rawPayload);
      if (date(row, 11) == null && text(row, 11)) makeWarning(warnings, sourceFileName, paid.name, rowNumber, 'invalid_payment_date', 'Paid invoice payment date could not be parsed.', rawPayload);
      const vendorKey = addCatalog(catalogs.vendors, vendorName, { source: 'Paid Invoices', raw_payload: { name: vendorName } });
      const storeKey = addCatalog(catalogs.stores, text(row, 2));
      const categoryKey = addCatalog(catalogs.categories, text(row, 1));
      const accountKey = addCatalog(catalogs.accounts, text(row, 4), { account_type: 'account', raw_payload: { source: 'Paid Invoices' } });
      const methodKey = addCatalog(catalogs.paymentMethods, text(row, 7));
      const checkInfo = text(row, 9);
      const notes = [checkInfo, text(row, 12) ? `Last payment date: ${date(row, 12) || text(row, 12)}` : null, text(row, 13)]
        .filter(Boolean)
        .join('\n') || null;
      const payload = compactPayload({
        category: text(row, 1),
        store: text(row, 2),
        vendor: vendorName,
        account: text(row, 4),
        invoice_number: text(row, 5),
        status: text(row, 6),
        payment_type: text(row, 7),
        check_number: text(row, 8),
        amount_paid: amountPaid,
        payment_date: date(row, 11),
        notes,
      });
      payments.push({
        invoice_key: null,
        vendor_key: vendorKey,
        store_key: storeKey,
        category_key: categoryKey,
        account_key: accountKey,
        payment_method_key: methodKey,
        invoice_id: null,
        vendor_id: null,
        invoice_number: text(row, 5),
        payment_date: date(row, 11),
        payment_method_id: null,
        account_id: null,
        check_number: text(row, 8),
        reference_number: checkInfo,
        amount_paid: amountPaid,
        status: text(row, 6),
        category_id: null,
        notes,
        source_file_name: sourceFileName,
        source_file_sha256: sourceFileSha256,
        source_sheet: paid.name.trim(),
        source_row: rowNumber,
        source_row_hash: sourceRowHash(payload),
        import_batch_id: null,
        raw_payload: rawPayload,
      });
      sheets['Paid Invoices'].rowsProcessed += 1;
    }
  }

  const creditCards = sheetByTrimmedName(workbook, 'Credit Card Payments');
  if (creditCards) {
    sheets['Credit Card Payments'] = {
      headers: headersFor(creditCards, 1),
      rowsProcessed: 0,
    };
    for (let rowNumber = 2; rowNumber <= creditCards.rowCount; rowNumber += 1) {
      const row = creditCards.getRow(rowNumber);
      if (!rowHasAnyValue(row, [1, 2, 3, 4, 5, 6, 7])) continue;
      const rawPayload = rawPayloadFor(creditCards, 1, rowNumber);
      const accountName = text(row, 1);
      if (!accountName) continue;
      const amount = money(row, 4);
      if (amount == null) makeWarning(warnings, sourceFileName, creditCards.name, rowNumber, 'payment_without_amount', 'Credit card payment row has no valid amount.', rawPayload);
      const accountKey = addCatalog(catalogs.accounts, accountName, {
        account_type: 'credit_card',
        raw_payload: { payment_account: text(row, 3) },
      });
      const payload = compactPayload({
        account: accountName,
        status: text(row, 2),
        payment_account: text(row, 3),
        amount,
        payment_date: date(row, 5),
        confirmation_number: text(row, 6),
        notes: text(row, 7),
      });
      creditCardPayments.push({
        account_key: accountKey,
        account_id: null,
        payment_date: date(row, 5),
        amount,
        confirmation_number: text(row, 6),
        status: text(row, 2),
        notes: text(row, 7) || (text(row, 3) ? `Paid from ${text(row, 3)}` : null),
        source_file_name: sourceFileName,
        source_file_sha256: sourceFileSha256,
        source_sheet: creditCards.name.trim(),
        source_row: rowNumber,
        source_row_hash: sourceRowHash(payload),
        import_batch_id: null,
        raw_payload: rawPayload,
      });
      sheets['Credit Card Payments'].rowsProcessed += 1;
    }
  }

  const personal = sheetByTrimmedName(workbook, 'Personal Bills');
  if (personal) {
    sheets['Personal Bills'] = {
      headers: headersFor(personal, 1),
      rowsProcessed: 0,
    };
    for (let rowNumber = 2; rowNumber <= personal.rowCount; rowNumber += 1) {
      const row = personal.getRow(rowNumber);
      if (!rowHasAnyValue(row, [1, 2, 3, 4, 5, 6, 7, 8, 9])) continue;
      const rawPayload = rawPayloadFor(personal, 1, rowNumber);
      const billName = text(row, 1);
      if (!billName) continue;
      const amount = money(row, 6);
      if (amount == null) makeWarning(warnings, sourceFileName, personal.name, rowNumber, 'payment_without_amount', 'Personal bill row has no valid amount.', rawPayload);
      const vendorKey = addCatalog(catalogs.vendors, billName, { source: 'Personal Bills', raw_payload: { name: billName } });
      const methodKey = addCatalog(catalogs.paymentMethods, text(row, 3));
      const payload = compactPayload({
        bill_name: billName,
        status: text(row, 2),
        payment_type: text(row, 3),
        check_number: text(row, 4),
        payer: text(row, 5),
        amount,
        payment_date: date(row, 7),
        confirmation_number: text(row, 8),
        notes: text(row, 9),
      });
      personalBills.push({
        bill_name: billName,
        vendor_key: vendorKey,
        vendor_id: null,
        payer: text(row, 5),
        payment_method_key: methodKey,
        payment_method_id: null,
        payment_date: date(row, 7),
        amount,
        status: text(row, 2),
        notes: [text(row, 4) ? `Check/reference: ${text(row, 4)}` : null, text(row, 8), text(row, 9)].filter(Boolean).join('\n') || null,
        source_file_name: sourceFileName,
        source_file_sha256: sourceFileSha256,
        source_sheet: personal.name.trim(),
        source_row: rowNumber,
        source_row_hash: sourceRowHash(payload),
        import_batch_id: null,
        raw_payload: rawPayload,
      });
      sheets['Personal Bills'].rowsProcessed += 1;
    }
  }

  const truck = sheetByTrimmedName(workbook, 'Truck');
  if (truck) {
    sheets.Truck = {
      headers: headersFor(truck, 3),
      rowsProcessed: 0,
    };
    for (let rowNumber = 4; rowNumber <= truck.rowCount; rowNumber += 1) {
      const row = truck.getRow(rowNumber);
      if (!rowHasAnyValue(row, [2, 3, 4, 5, 6, 7, 8, 9])) continue;
      const rawPayload = rawPayloadFor(truck, 3, rowNumber);
      const violationNumber = text(row, 2);
      if (!violationNumber) continue;
      const amount = money(row, 5);
      const paidAmount = money(row, 9);
      if (amount == null) makeWarning(warnings, sourceFileName, truck.name, rowNumber, 'invalid_amount', 'Truck violation amount is empty or invalid.', rawPayload);
      const payload = compactPayload({
        violation_number: violationNumber,
        violation_date: date(row, 3),
        description: text(row, 4),
        amount,
        receipt_number: text(row, 6),
        payment_method: text(row, 7),
        payment_date: date(row, 8),
        paid_amount: paidAmount,
      });
      truckViolations.push({
        violation_number: violationNumber,
        violation_date: date(row, 3),
        description: text(row, 4),
        amount,
        receipt_number: text(row, 6),
        payment_method: text(row, 7),
        paid_amount: paidAmount,
        payment_date: date(row, 8),
        is_possible_duplicate: false,
        duplicate_group_key: null,
        notes: null,
        source_file_name: sourceFileName,
        source_file_sha256: sourceFileSha256,
        source_sheet: truck.name.trim(),
        source_row: rowNumber,
        source_row_hash: sourceRowHash(payload),
        import_batch_id: null,
        raw_payload: rawPayload,
      });
      sheets.Truck.rowsProcessed += 1;
    }
  }

  const duplicateTruckKeys = detectTruckDuplicateKeys(truckViolations);
  truckViolations.forEach(row => {
    const key = truckDuplicateGroupKey(row.violation_number);
    if (key && duplicateTruckKeys.has(key)) {
      row.is_possible_duplicate = true;
      row.duplicate_group_key = key;
      makeWarning(
        warnings,
        sourceFileName,
        row.source_sheet,
        row.source_row,
        'duplicate_truck_violation',
        `Possible duplicate truck violation "${row.violation_number}".`,
        row.raw_payload
      );
    }
  });

  const invoiceMatchIndex = new Map();
  invoices.forEach(invoice => {
    if (!invoice.vendor_key || !invoice.invoice_number) return;
    const key = `${invoice.vendor_key}|${normalizeText(invoice.invoice_number)}|${invoice.amount || ''}`;
    if (!invoiceMatchIndex.has(key)) invoiceMatchIndex.set(key, []);
    invoiceMatchIndex.get(key).push(invoice);
  });

  payments.forEach(payment => {
    if (!payment.vendor_key || !payment.invoice_number) return;
    const key = `${payment.vendor_key}|${normalizeText(payment.invoice_number)}|${payment.amount_paid || ''}`;
    const matches = invoiceMatchIndex.get(key) || [];
    if (matches.length === 1) {
      payment.invoice_key = sourceRowKey(sourceFileSha256, matches[0].source_sheet, matches[0].source_row);
      return;
    }
    makeWarning(
      warnings,
      sourceFileName,
      payment.source_sheet,
      payment.source_row,
      'paid_invoice_match_missing',
      'Paid invoice could not be confidently matched to a pending invoice row.',
      payment.raw_payload
    );
  });

  return {
    catalogs,
    creditCardPayments,
    imports: [],
    invoices,
    payments,
    personalBills,
    sheets,
    sheetsFound,
    truckViolations,
    warnings,
  };
}

function recordTotals(parsed) {
  const pendingInvoices = parsed.invoices.filter(row => row.status !== 'paid');
  return {
    pendingInvoices: {
      rows: parsed.invoices.length,
      paidRows: parsed.invoices.filter(row => row.status === 'paid').length,
      pendingRows: pendingInvoices.length,
      totalAmount: centsToDecimal(addCents(parsed.invoices.map(row => row.amount))),
      totalCredit: centsToDecimal(addCents(parsed.invoices.map(row => row.credit))),
      totalFinalAmountToPay: centsToDecimal(addCents(parsed.invoices.map(row => finalAmountToPay(row.amount, row.credit)))),
      openPendingAmount: centsToDecimal(addCents(pendingInvoices.map(row => finalAmountToPay(row.amount, row.credit)))),
    },
    paidInvoices: {
      rows: parsed.payments.length,
      totalPaid: centsToDecimal(addCents(parsed.payments.map(row => row.amount_paid))),
    },
    creditCardPayments: {
      rows: parsed.creditCardPayments.length,
      total: centsToDecimal(addCents(parsed.creditCardPayments.map(row => row.amount))),
    },
    personalBills: {
      rows: parsed.personalBills.length,
      total: centsToDecimal(addCents(parsed.personalBills.map(row => row.amount))),
    },
    truck: {
      rows: parsed.truckViolations.length,
      totalAmount: centsToDecimal(addCents(parsed.truckViolations.map(row => row.amount))),
      totalPaid: centsToDecimal(addCents(parsed.truckViolations.map(row => row.paid_amount))),
      duplicateRows: parsed.truckViolations.filter(row => row.is_possible_duplicate).length,
    },
  };
}

function withoutInternalKeys(row) {
  const copy = { ...row };
  delete copy.vendor_key;
  delete copy.store_key;
  delete copy.category_key;
  delete copy.account_key;
  delete copy.payment_method_key;
  delete copy.invoice_key;
  return copy;
}

async function countExistingRows(supabase, table, rows, sourceFileSha256) {
  if (rows.length === 0) return new Set();
  const { data, error } = await supabase
    .from(table)
    .select('source_sheet, source_row')
    .eq('source_file_sha256', sourceFileSha256);
  if (error) throw error;
  return new Set((data || []).map(row => sourceRowKey(sourceFileSha256, row.source_sheet, row.source_row)));
}

async function upsertCatalog(supabase, table, rows, onConflict = 'normalized_name') {
  if (rows.length === 0) return new Map();
  const payload = rows.map(row => ({
    ...row,
    updated_at: nowIso(),
  }));
  const { data, error } = await supabase
    .from(table)
    .upsert(payload, { onConflict })
    .select('id, normalized_name');
  if (error) throw error;
  return new Map((data || []).map(row => [row.normalized_name, row.id]));
}

async function upsertSourceRows(supabase, table, rows, sourceFileSha256) {
  if (rows.length === 0) return { inserted: 0, updated: 0, skipped: 0, rows: [] };
  const existing = await countExistingRows(supabase, table, rows, sourceFileSha256);
  const payload = rows.map(row => ({ ...withoutInternalKeys(row), updated_at: nowIso() }));
  const { data, error } = await supabase
    .from(table)
    .upsert(payload, { onConflict: 'source_file_sha256,source_sheet,source_row' })
    .select('*');
  if (error) throw error;

  let inserted = 0;
  let updated = 0;
  for (const row of rows) {
    const key = sourceRowKey(sourceFileSha256, row.source_sheet, row.source_row);
    if (existing.has(key)) updated += 1;
    else inserted += 1;
  }
  return { inserted, updated, skipped: 0, rows: data || [] };
}

async function importToSupabase(parsed, sourceFileName, sourceFileSha256) {
  await loadDotEnv();
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceRoleKey) {
    return {
      imported: false,
      reason: 'SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to write to Supabase.',
      rowsInserted: 0,
      rowsUpdated: 0,
      rowsSkipped: 0,
      databaseTotals: null,
    };
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const rowsProcessed =
    parsed.invoices.length +
    parsed.payments.length +
    parsed.creditCardPayments.length +
    parsed.personalBills.length +
    parsed.truckViolations.length;

  const { data: batch, error: batchError } = await supabase
    .from('accounting_import_batches')
    .insert({
      source_file_name: sourceFileName,
      source_file_sha256: sourceFileSha256,
      sheets_processed: Object.keys(parsed.sheets),
      rows_processed: rowsProcessed,
      warnings_count: parsed.warnings.length,
      reconciliation_summary: recordTotals(parsed),
    })
    .select('*')
    .single();
  if (batchError) throw batchError;

  const vendorIds = await upsertCatalog(supabase, 'accounting_vendors', [...parsed.catalogs.vendors.values()]);
  const storeIds = await upsertCatalog(supabase, 'accounting_stores', [...parsed.catalogs.stores.values()]);
  const accountIds = await upsertCatalog(supabase, 'accounting_accounts', [...parsed.catalogs.accounts.values()]);
  const paymentMethodIds = await upsertCatalog(supabase, 'accounting_payment_methods', [...parsed.catalogs.paymentMethods.values()]);
  const categoryIds = await upsertCatalog(supabase, 'accounting_invoice_categories', [...parsed.catalogs.categories.values()]);

  parsed.invoices.forEach(row => {
    row.vendor_id = row.vendor_key ? vendorIds.get(row.vendor_key) || null : null;
    row.store_id = row.store_key ? storeIds.get(row.store_key) || null : null;
    row.category_id = row.category_key ? categoryIds.get(row.category_key) || null : null;
    row.import_batch_id = batch.id;
  });

  let rowsInserted = 0;
  let rowsUpdated = 0;
  let rowsSkipped = 0;
  const invoiceResult = await upsertSourceRows(supabase, 'accounting_invoices', parsed.invoices, sourceFileSha256);
  rowsInserted += invoiceResult.inserted;
  rowsUpdated += invoiceResult.updated;
  rowsSkipped += invoiceResult.skipped;

  const invoiceIdsBySource = new Map(
    invoiceResult.rows.map(row => [sourceRowKey(sourceFileSha256, row.source_sheet, row.source_row), row.id])
  );
  parsed.payments.forEach(row => {
    row.invoice_id = row.invoice_key ? invoiceIdsBySource.get(row.invoice_key) || null : null;
    row.vendor_id = row.vendor_key ? vendorIds.get(row.vendor_key) || null : null;
    row.account_id = row.account_key ? accountIds.get(row.account_key) || null : null;
    row.payment_method_id = row.payment_method_key ? paymentMethodIds.get(row.payment_method_key) || null : null;
    row.category_id = row.category_key ? categoryIds.get(row.category_key) || null : null;
    row.import_batch_id = batch.id;
  });
  parsed.creditCardPayments.forEach(row => {
    row.account_id = row.account_key ? accountIds.get(row.account_key) || null : null;
    row.import_batch_id = batch.id;
  });
  parsed.personalBills.forEach(row => {
    row.vendor_id = row.vendor_key ? vendorIds.get(row.vendor_key) || null : null;
    row.payment_method_id = row.payment_method_key ? paymentMethodIds.get(row.payment_method_key) || null : null;
    row.import_batch_id = batch.id;
  });
  parsed.truckViolations.forEach(row => {
    row.import_batch_id = batch.id;
  });

  for (const [table, rows] of [
    ['accounting_invoice_payments', parsed.payments],
    ['accounting_credit_card_payments', parsed.creditCardPayments],
    ['accounting_personal_bills', parsed.personalBills],
    ['accounting_truck_violations', parsed.truckViolations],
  ]) {
    const result = await upsertSourceRows(supabase, table, rows, sourceFileSha256);
    rowsInserted += result.inserted;
    rowsUpdated += result.updated;
    rowsSkipped += result.skipped;
  }

  if (parsed.warnings.length > 0) {
    const { error: warningsError } = await supabase.from('accounting_import_warnings').insert(
      parsed.warnings.map(warning => ({
        ...warning,
        import_batch_id: batch.id,
      }))
    );
    if (warningsError) throw warningsError;
  }

  const { error: updateBatchError } = await supabase
    .from('accounting_import_batches')
    .update({
      rows_inserted: rowsInserted,
      rows_updated: rowsUpdated,
      rows_skipped: rowsSkipped,
      warnings_count: parsed.warnings.length,
      errors_count: 0,
      reconciliation_summary: recordTotals(parsed),
      updated_at: nowIso(),
    })
    .eq('id', batch.id);
  if (updateBatchError) throw updateBatchError;

  return {
    batchId: batch.id,
    databaseTotals: recordTotals(parsed),
    imported: true,
    rowsInserted,
    rowsSkipped,
    rowsUpdated,
  };
}

function headersMarkdown(parsed) {
  return Object.entries(parsed.sheets)
    .map(([sheet, info]) => {
      const headers = info.headers.map(item => `${item.column}. ${item.header}`).join(', ');
      return `- ${sheet}: ${headers || 'No headers detected'}`;
    })
    .join('\n');
}

function totalsMarkdown(totals) {
  return [
    `- Pending Invoices: ${totals.pendingInvoices.rows} rows, ${totals.pendingInvoices.paidRows} paid, ${totals.pendingInvoices.pendingRows} pending, amount ${totals.pendingInvoices.totalAmount}, credit ${totals.pendingInvoices.totalCredit}, final ${totals.pendingInvoices.totalFinalAmountToPay}, open pending ${totals.pendingInvoices.openPendingAmount}`,
    `- Paid Invoices: ${totals.paidInvoices.rows} rows, paid total ${totals.paidInvoices.totalPaid}`,
    `- Credit Card Payments: ${totals.creditCardPayments.rows} rows, total ${totals.creditCardPayments.total}`,
    `- Personal Bills: ${totals.personalBills.rows} rows, total ${totals.personalBills.total}`,
    `- Truck: ${totals.truck.rows} rows, amount ${totals.truck.totalAmount}, paid ${totals.truck.totalPaid}, duplicate rows ${totals.truck.duplicateRows}`,
  ].join('\n');
}

function warningsMarkdown(warnings) {
  if (warnings.length === 0) return 'No warnings.';
  const shown = warnings.slice(0, 50).map(warning =>
    `- [${warning.code}] ${warning.source_sheet || 'unknown'} row ${warning.source_row ?? '-'}: ${warning.message}`
  );
  if (warnings.length > shown.length) {
    shown.push(`- ... ${warnings.length - shown.length} additional warnings omitted from this preview.`);
  }
  return shown.join('\n');
}

async function writeReport({ excelPath, sourceFileName, sourceFileSha256, parsed, importResult }) {
  const totals = recordTotals(parsed);
  const report = `# Excel Import Reconciliation

Generated at: ${nowIso()}

## Source
- File: ${excelPath}
- Source file name: ${sourceFileName}
- SHA256: ${sourceFileSha256}
- Supabase import: ${importResult.imported ? 'completed' : 'not written'}
${importResult.imported ? `- Import batch ID: ${importResult.batchId}` : `- Reason: ${importResult.reason}`}

## Sheets Found
${parsed.sheetsFound.map(sheet => `- ${sheet}`).join('\n')}

## Sheets Processed
${Object.entries(parsed.sheets).map(([sheet, info]) => `- ${sheet}: ${info.rowsProcessed} rows processed`).join('\n')}

## Headers Detected
${headersMarkdown(parsed)}

## Catalogs Derived
- Vendors: ${parsed.catalogs.vendors.size}
- Stores: ${parsed.catalogs.stores.size}
- Accounts/cards: ${parsed.catalogs.accounts.size}
- Payment methods: ${parsed.catalogs.paymentMethods.size}
- Categories: ${parsed.catalogs.categories.size}

## Parsed Totals From Excel
${totalsMarkdown(totals)}

## Supabase Write Summary
- Rows inserted: ${importResult.rowsInserted}
- Rows updated: ${importResult.rowsUpdated}
- Rows skipped: ${importResult.rowsSkipped}
- Warnings: ${parsed.warnings.length}
- Errors: ${importResult.error ? 1 : 0}

## Supabase Totals
${importResult.databaseTotals ? totalsMarkdown(importResult.databaseTotals) : 'Supabase totals were not calculated because the import was not written.'}

## Difference
${importResult.databaseTotals ? 'Parsed totals and Supabase totals are expected to match for this import batch.' : 'No DB comparison available. Configure SUPABASE_SERVICE_ROLE_KEY and rerun the import command.'}

## Warnings And Dubious Data
${warningsMarkdown(parsed.warnings)}

## Validation Instructions
1. Apply Supabase migrations, including the accounting migration.
2. Set SUPABASE_SERVICE_ROLE_KEY in a local, non-frontend environment.
3. Run \`npm run import:modern-state-excel\`.
4. Open \`/accounting\` as an admin or accounting user.
5. Compare dashboard totals with the "Parsed Totals From Excel" section above.
6. Open \`/accounting/imports\` to review import batches and warnings.
7. Rerun the import command; the row counts should move to updated/skipped behavior without duplicate records.
`;

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, report, 'utf8');
}

async function main() {
  const excelPath = getArg('--file') || DEFAULT_EXCEL_PATH;
  const absoluteExcelPath = path.resolve(excelPath);
  const fileBuffer = await fs.readFile(absoluteExcelPath);
  const sourceFileSha256 = createHash('sha256').update(fileBuffer).digest('hex');
  const sourceFileName = path.basename(absoluteExcelPath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  const parsed = parseWorkbook(workbook, sourceFileName, sourceFileSha256);

  let importResult;
  try {
    importResult = await importToSupabase(parsed, sourceFileName, sourceFileSha256);
  } catch (error) {
    importResult = {
      databaseTotals: null,
      error,
      imported: false,
      reason: error instanceof Error ? error.message : 'Unknown import error',
      rowsInserted: 0,
      rowsSkipped: 0,
      rowsUpdated: 0,
    };
  }

  await writeReport({
    excelPath: absoluteExcelPath,
    sourceFileName,
    sourceFileSha256,
    parsed,
    importResult,
  });

  const totals = recordTotals(parsed);
  console.log(JSON.stringify({
    report: REPORT_PATH,
    imported: importResult.imported,
    reason: importResult.imported ? undefined : importResult.reason,
    rows: {
      invoices: parsed.invoices.length,
      payments: parsed.payments.length,
      creditCardPayments: parsed.creditCardPayments.length,
      personalBills: parsed.personalBills.length,
      truckViolations: parsed.truckViolations.length,
    },
    totals,
    warnings: parsed.warnings.length,
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
