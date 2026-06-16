import { describe, expect, it } from 'vitest';
import { parseSquareVendorCatalogFile } from './squareVendorCatalogImport';

describe('parseSquareVendorCatalogFile', () => {
  it('maps Vendor Name to SKU and GTIN columns', async () => {
    const file = new File(
      [
        [
          'Item Name,SKU,GTIN,Vendor Name',
          'Paint Set,ABC-123,000111222333,Acme Supply',
          'Ribbon,RIB-9,,Party Vendor',
          'Missing Vendor,MISS-1,,',
        ].join('\n'),
      ],
      'square-catalog.csv',
      { type: 'text/csv' }
    );

    const parsed = await parseSquareVendorCatalogFile(file);

    expect(parsed.rows).toEqual([
      { barcode: 'ABC-123', vendorName: 'Acme Supply' },
      { barcode: '000111222333', vendorName: 'Acme Supply' },
      { barcode: 'RIB-9', vendorName: 'Party Vendor' },
    ]);
    expect(parsed.skippedRows).toBe(1);
    expect(parsed.vendorHeader).toBe('Vendor Name');
    expect(parsed.barcodeHeaders).toEqual(['SKU', 'GTIN']);
  });
});
