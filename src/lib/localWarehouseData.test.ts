import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearLocalWarehouseData,
  createLocalCarrier,
  createLocalSupplier,
  deleteLocalBatch,
  deleteLocalSupplier,
  getPendingOfflineChanges,
  listLocalCarriers,
  listLocalHistoryBatches,
  listLocalSuppliers,
  saveLocalBatch,
} from './localWarehouseData';

describe('localWarehouseData', () => {
  beforeEach(() => {
    clearLocalWarehouseData();
  });

  it('seeds default carriers and suppliers', () => {
    expect(listLocalCarriers().map(carrier => carrier.name)).toContain('UPS');
    expect(listLocalSuppliers().map(supplier => supplier.name)).toContain('Acme Apparel');
  });

  it('saves a receipt locally and queues offline changes', () => {
    const carrier = createLocalCarrier({ name: 'Offline Carrier', carrier_type: 'parcel' }, { queueSync: true });
    const supplier = createLocalSupplier({ name: 'Offline Supplier', code: 'OFF', active: true }, { queueSync: true });

    const batch = saveLocalBatch(
      {
        carrier_id: carrier.id,
        received_by_employee_id: 'employee-1',
        received_at: '2026-05-26T12:00:00.000Z',
        notes: null,
      },
      [
        {
          batch_id: '',
          supplier_id: supplier.id,
          package_type: 'boxes',
          package_count: 3,
          damaged_box: false,
        },
      ],
      { queueSync: true }
    );

    const history = listLocalHistoryBatches();
    expect(history).toHaveLength(1);
    expect(history[0].carrier_id).toBe(carrier.id);
    expect(history[0].receipt_items[0].suppliers?.name).toBe('Offline Supplier');
    expect(getPendingOfflineChanges()).toHaveLength(3);
    expect(batch.offlineQueued).toBe(true);

    expect(() => deleteLocalSupplier(supplier.id)).toThrow(/supplier is already used/i);
    deleteLocalBatch(batch.id);
    expect(() => deleteLocalSupplier(supplier.id)).not.toThrow();
  });

  it('rejects receipts without receiving lines', () => {
    const carrier = createLocalCarrier({ name: 'No Items Carrier', carrier_type: 'parcel' });

    expect(() =>
      saveLocalBatch(
        {
          carrier_id: carrier.id,
          received_by_employee_id: 'employee-1',
          received_at: '2026-05-26T12:00:00.000Z',
          notes: null,
        },
        []
      )
    ).toThrow(/at least one receiving line/i);
  });
});
