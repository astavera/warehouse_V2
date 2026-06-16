import { beforeEach, describe, expect, it } from 'vitest';
import {
  canAccessAccountingPermission,
  canAccessModule,
  getDefaultLandingPath,
} from '@/lib/permissions';
import {
  addDaysToIsoDate,
  finalAmountToPay,
  findTruckDuplicateGroups,
  hasCreditApplied,
  isDueSoon,
  isHighAmount,
  isOverdue,
  parseExcelDate,
  parseMoney,
  parsePaidStatus,
  paymentTermsLabel,
  sourceRowHash,
  sourceRowKey,
  summarizeVendorBalances,
  type AccountingInvoice,
  type AccountingTruckViolation,
} from '@/lib/accounting';
import {
  clearLocalAccountingData,
  importLocalAccountingTemplate,
  listLocalAccountingImportBatches,
  listLocalAccountingInvoicePayments,
  listLocalAccountingInvoices,
  listLocalAccountingTruckViolations,
} from '@/lib/localAccountingData';
import type { AccountingTemplateImport } from '@/lib/accountingExcel';

function invoice(patch: Partial<AccountingInvoice>): AccountingInvoice {
  return {
    id: 'invoice-test',
    vendor_id: null,
    store_id: null,
    invoice_number: null,
    issue_date: null,
    due_date: null,
    amount: '0.00',
    credit: '0.00',
    final_amount_to_pay: null,
    status: 'pending',
    paid: false,
    category_id: null,
    notes: null,
    source_file_name: 'test.xlsx',
    source_file_sha256: 'sha',
    source_sheet: 'Pending Invoices',
    source_row: 2,
    source_row_hash: 'hash',
    import_batch_id: null,
    raw_payload: {},
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...patch,
  };
}

describe('accounting domain helpers', () => {
  it('parses money and calculates final amount without floating point drift', () => {
    expect(parseMoney('$1,234.567')).toBe('1234.57');
    expect(parseMoney('(45.125)')).toBe('-45.13');
    expect(finalAmountToPay('100.10', '0.30')).toBe('99.80');
  });

  it('parses Excel dates from serials and strings', () => {
    expect(parseExcelDate(46023)).toBe('2026-01-01');
    expect(parseExcelDate('1/5/26')).toBe('2026-01-05');
  });

  it('labels payment terms and calculates due dates', () => {
    expect(paymentTermsLabel(30)).toBe('Net 30');
    expect(paymentTermsLabel(0)).toBe('Due on receipt');
    expect(addDaysToIsoDate('2026-06-16', 30)).toBe('2026-07-16');
  });

  it('parses paid status values', () => {
    expect(parsePaidStatus('Paid ')).toBe('paid');
    expect(parsePaidStatus('')).toBe('pending');
    expect(parsePaidStatus('void')).toBe('cancelled');
  });

  it('detects invoice badges and due windows', () => {
    const today = new Date('2026-01-10T12:00:00.000Z');
    const row = invoice({ amount: '8000.00', credit: '1000.00', due_date: '2026-01-08' });
    expect(isOverdue(row, today)).toBe(true);
    expect(isDueSoon(invoice({ due_date: '2026-01-15' }), 7, today)).toBe(true);
    expect(isHighAmount(row)).toBe(true);
    expect(hasCreditApplied(row)).toBe(true);
  });

  it('summarizes vendor balances due within 15 days', () => {
    const today = new Date('2026-01-10T12:00:00.000Z');
    const rows = summarizeVendorBalances([
      invoice({
        accounting_vendors: { id: 'vendor-a', name: 'Vendor A', normalized_name: 'vendor a' },
        amount: '100.00',
        credit: '10.00',
        due_date: '2026-01-20',
        vendor_id: 'vendor-a',
      }),
      invoice({
        accounting_vendors: { id: 'vendor-a', name: 'Vendor A', normalized_name: 'vendor a' },
        amount: '200.00',
        due_date: '2026-02-05',
        vendor_id: 'vendor-a',
      }),
      invoice({
        accounting_vendors: { id: 'vendor-a', name: 'Vendor A', normalized_name: 'vendor a' },
        amount: '300.00',
        due_date: '2026-01-15',
        status: 'paid',
        paid: true,
        vendor_id: 'vendor-a',
      }),
    ], today);

    expect(rows[0].dueNext15Count).toBe(1);
    expect(rows[0].dueNext15Amount).toBe('90.00');
    expect(rows[0].totalAmount).toBe('290.00');
  });

  it('creates stable source row keys and hashes', () => {
    const payload = { b: 2, a: 'one' };
    expect(sourceRowKey('sha', 'Pending Invoices', 12)).toBe('sha:Pending Invoices:12');
    expect(sourceRowHash(payload)).toBe(sourceRowHash({ a: 'one', b: 2 }));
  });

  it('detects duplicate truck violations', () => {
    const rows = [
      { violation_number: '925661674-9' },
      { violation_number: '925661674-9 ' },
      { violation_number: '24-163' },
    ] as AccountingTruckViolation[];
    expect(findTruckDuplicateGroups(rows).has('925661674-9')).toBe(true);
  });
});

describe('accounting mock local data', () => {
  beforeEach(() => {
    clearLocalAccountingData();
  });

  it('seeds mock invoices, imports, and truck duplicate data', () => {
    expect(listLocalAccountingInvoices().length).toBeGreaterThan(0);
    expect(listLocalAccountingImportBatches()[0].source_file_name).toBe('_Modern State 2026 (1).xlsx');
    expect(listLocalAccountingTruckViolations().some(row => row.is_possible_duplicate)).toBe(true);
  });

  it('stores the paid invoice Store column from template imports', () => {
    const payload: AccountingTemplateImport = {
      accounts: [],
      creditCardPayments: [],
      fileName: 'paid-store-test.xlsx',
      fileSha256: 'paid-store-test-sha',
      invoices: [],
      payments: [
        {
          account_name: null,
          account_number: 'ACCT-123',
          amount_paid: '100.00',
          category_name: 'Freight',
          check_number: '1001',
          invoice_number: 'INV-STORE-1',
          notes: null,
          payment_date: '2026-06-10',
          payment_method_name: 'Check',
          reference_number: null,
          rowNumber: 2,
          status: 'Paid',
          store_name: 'Warehouse',
          vendor_name: 'Store Test Vendor',
        },
      ],
      personalBills: [],
      sheetsProcessed: [{ name: 'Paid Invoices', rowsProcessed: 1 }],
      truckViolations: [],
      vendors: [],
      warnings: [],
    };

    importLocalAccountingTemplate(payload);
    const payment = listLocalAccountingInvoicePayments().find(row => row.invoice_number === 'INV-STORE-1');

    expect(payment?.accounting_stores?.name).toBe('Warehouse');
  });
});

describe('accounting permissions', () => {
  it('gives admin and accounting access to accounting', () => {
    expect(canAccessModule({ role: 'admin', permissions: null }, 'accounting')).toBe(true);
    expect(canAccessModule({ role: 'accounting', permissions: null }, 'accounting')).toBe(true);
    expect(canAccessModule({ role: 'admin', permissions: null }, 'expected_boxes')).toBe(true);
    expect(canAccessModule({ role: 'accounting', permissions: null }, 'expected_boxes')).toBe(true);
    expect(canAccessAccountingPermission({ role: 'accounting', permissions: null }, 'accounting.import')).toBe(true);
    expect(getDefaultLandingPath({ role: 'accounting', permissions: null })).toBe('/accounting');
  });

  it('keeps warehouse and store out of restricted modules by default', () => {
    expect(canAccessModule({ role: 'warehouse', permissions: null }, 'accounting')).toBe(false);
    expect(canAccessModule({ role: 'store', permissions: null }, 'accounting')).toBe(false);
    expect(canAccessModule({ role: 'warehouse', permissions: null }, 'expected_boxes')).toBe(false);
    expect(canAccessModule({ role: 'store', permissions: null }, 'expected_boxes')).toBe(false);
  });
});
