import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import { invokeProtectedFunction } from '@/lib/protectedFunctions';
import {
  createLocalCarrier,
  createLocalEmployee,
  createLocalSupplier,
  deleteLocalCarrier,
  deleteLocalSupplier,
  getPendingOfflineChanges,
  isMockLocal,
  listLocalBatches,
  listLocalCarriers,
  listLocalEmployees,
  listLocalSuppliers,
  removePendingOfflineChange,
  saveLocalBatch,
  shouldUseLocalData,
  updateLocalCarrier,
  updateLocalEmployee,
  updateLocalSupplier,
  type OfflineQueueItem,
} from '@/lib/localWarehouseData';

type Supplier = Tables<'suppliers'>;
type Carrier = Tables<'carriers'>;
type Employee = Tables<'employees'>;
type ReceiptBatch = Tables<'receipt_batches'>;
type ReceiptItem = Tables<'receipt_items'>;

type ExpectedBoxMatch = {
  id: string;
  supplier_id: string;
  po_number: string | null;
  match_condition: 'supplier_only' | 'supplier_po';
};

type ExpectedBoxesQuery = PromiseLike<{
  data: unknown;
  error: Error | null;
}> & {
  select: (...args: unknown[]) => ExpectedBoxesQuery;
  update: (...args: unknown[]) => ExpectedBoxesQuery;
  in: (...args: unknown[]) => ExpectedBoxesQuery;
  eq: (...args: unknown[]) => ExpectedBoxesQuery;
};

const expectedBoxesDb = supabase as unknown as {
  from: (table: string) => ExpectedBoxesQuery;
};
const EMPLOYEE_SELECT = 'id, name, active, created_at, updated_at, auth_user_id';

export function useSuppliers() {
  const [data, setData] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      if (shouldUseLocalData()) {
        setData(listLocalSuppliers());
        return;
      }

      const { data, error } = await supabase.from('suppliers').select('*').order('name');
      if (error) throw error;
      setData(data || []);
    } catch (err) {
      console.error('Failed to load suppliers', err);
      setData(listLocalSuppliers());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const add = async (s: TablesInsert<'suppliers'>) => {
    if (shouldUseLocalData()) {
      const row = createLocalSupplier(s, { queueSync: !isMockLocal });
      await fetch();
      return row;
    }

    try {
      const { data: row, error } = await supabase.from('suppliers').insert(s).select().single();
      if (error) throw error;
      await fetch();
      return row!;
    } catch (err) {
      console.warn('Supplier saved offline because remote save failed', err);
      const row = createLocalSupplier(s, { queueSync: true });
      await fetch();
      return row;
    }
  };

  const update = async (id: string, patch: Partial<Supplier>) => {
    if (shouldUseLocalData()) {
      updateLocalSupplier(id, patch);
      await fetch();
      return;
    }

    const { error } = await supabase.from('suppliers').update(patch).eq('id', id);
    if (error) throw error;
    await fetch();
  };

  const remove = async (id: string) => {
    if (shouldUseLocalData()) {
      deleteLocalSupplier(id);
      await fetch();
      return;
    }

    const { error } = await supabase.from('suppliers').delete().eq('id', id);
    if (error) throw error;
    await fetch();
  };

  return { suppliers: data, loading, refetch: fetch, addSupplier: add, updateSupplier: update, deleteSupplier: remove };
}

export function useCarriers() {
  const [data, setData] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      if (shouldUseLocalData()) {
        setData(listLocalCarriers());
        return;
      }

      const { data, error } = await supabase.from('carriers').select('*').order('name');
      if (error) throw error;
      setData(data || []);
    } catch (err) {
      console.error('Failed to load carriers', err);
      setData(listLocalCarriers());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const add = async (s: TablesInsert<'carriers'>) => {
    if (shouldUseLocalData()) {
      const row = createLocalCarrier(s, { queueSync: !isMockLocal });
      await fetch();
      return row;
    }

    try {
      const { data: row, error } = await supabase.from('carriers').insert(s).select().single();
      if (error) throw error;
      await fetch();
      return row!;
    } catch (err) {
      console.warn('Carrier saved offline because remote save failed', err);
      const row = createLocalCarrier(s, { queueSync: true });
      await fetch();
      return row;
    }
  };

  const update = async (id: string, patch: Partial<Carrier>) => {
    if (shouldUseLocalData()) {
      updateLocalCarrier(id, patch);
      await fetch();
      return;
    }

    const { error } = await supabase.from('carriers').update(patch).eq('id', id);
    if (error) throw error;
    await fetch();
  };

  const remove = async (id: string) => {
    if (shouldUseLocalData()) {
      deleteLocalCarrier(id);
      await fetch();
      return;
    }

    const { error } = await supabase.from('carriers').delete().eq('id', id);
    if (error) throw error;
    await fetch();
  };

  return { carriers: data, loading, refetch: fetch, addCarrier: add, updateCarrier: update, deleteCarrier: remove };
}

export function useEmployees() {
  const [data, setData] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      if (shouldUseLocalData()) {
        setData(listLocalEmployees());
        return;
      }

      const { data, error } = await supabase.from('employees').select(EMPLOYEE_SELECT).order('name');
      if (error) throw error;
      setData((data || []) as Employee[]);
    } catch (err) {
      console.error('Failed to load employees', err);
      setData(listLocalEmployees());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const add = async (s: TablesInsert<'employees'>) => {
    if (shouldUseLocalData()) {
      const row = createLocalEmployee(s);
      await fetch();
      return row;
    }

    const { data: row, error } = await supabase.from('employees').insert(s).select().single();
    if (error) throw error;
    await fetch();
    return row!;
  };

  const update = async (id: string, patch: Partial<Employee>) => {
    if (shouldUseLocalData()) {
      updateLocalEmployee(id, patch);
      await fetch();
      return;
    }

    await supabase.from('employees').update(patch).eq('id', id);
    await fetch();
  };

  return { employees: data, loading, refetch: fetch, addEmployee: add, updateEmployee: update };
}

export interface BatchWithItems extends ReceiptBatch {
  receipt_items: ReceiptItem[];
}

export function useBatches(dateFilter?: string) {
  const [data, setData] = useState<BatchWithItems[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      if (shouldUseLocalData()) {
        setData(listLocalBatches(dateFilter));
        return;
      }

      let query = supabase
        .from('receipt_batches')
        .select('*, receipt_items(*)')
        .order('received_at', { ascending: false });

      if (dateFilter) {
        query = query.gte('received_at', `${dateFilter}T00:00:00`).lte('received_at', `${dateFilter}T23:59:59`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setData((data as BatchWithItems[]) || []);
    } catch (err) {
      console.error('Failed to load batches', err);
      setData(listLocalBatches(dateFilter));
    } finally {
      setLoading(false);
    }
  }, [dateFilter]);

  useEffect(() => { fetch(); }, [fetch]);

  return { batches: data, loading, refetch: fetch };
}

export function useTodayBatches() {
  const today = new Date().toISOString().split('T')[0];
  return useBatches(today);
}

export function useReceiptDates() {
  const [dates, setDates] = useState<Date[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        if (shouldUseLocalData()) {
          const unique = new Set(listLocalBatches().map(row => row.received_at.split('T')[0]));
          setDates(Array.from(unique).map(d => new Date(`${d}T12:00:00`)));
          return;
        }

        const { data, error } = await supabase
          .from('receipt_batches')
          .select('received_at');
        if (error) throw error;
        const unique = new Set((data || []).map(r => r.received_at.split('T')[0]));
        setDates(Array.from(unique).map(d => new Date(d + 'T12:00:00')));
      } catch (err) {
        console.error('Failed to load receipt dates', err);
        setDates([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { dates, loading };
}

export function useReceiptCalendarDetails() {
  const [dates, setDates] = useState<Date[]>([]);
  const [detailsByDate, setDetailsByDate] = useState<
    Record<
      string,
      {
        carrierIds: string[];
        carrierCounts: Record<string, number>;
        supplierIdsByCarrier: Record<string, string[]>;
        supplierDetailsByCarrier: Record<
          string,
          Record<
            string,
            {
              boxes: number;
              pallets: number;
              batchIds: string[];
            }
          >
        >;
        count: number;
        packageCount: number;
        boxCount: number;
        palletCount: number;
      }
    >
  >({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = shouldUseLocalData()
          ? listLocalBatches()
          : (
              await supabase
                .from('receipt_batches')
                .select('id, received_at, carrier_id, receipt_items(package_count, package_type, supplier_id)')
            ).data;

        if (data) {
        const nextDetails: Record<
          string,
          {
            carrierIds: string[];
            carrierCounts: Record<string, number>;
            supplierIdsByCarrier: Record<string, string[]>;
            supplierDetailsByCarrier: Record<
              string,
              Record<
                string,
                {
                  boxes: number;
                  pallets: number;
                  batchIds: string[];
                }
              >
            >;
            count: number;
            packageCount: number;
            boxCount: number;
            palletCount: number;
          }
        > = {};

        data.forEach(row => {
          const dateKey = row.received_at.split('T')[0];
          if (!nextDetails[dateKey]) {
            nextDetails[dateKey] = {
              carrierIds: [],
              carrierCounts: {},
              supplierIdsByCarrier: {},
              supplierDetailsByCarrier: {},
              count: 0,
              packageCount: 0,
              boxCount: 0,
              palletCount: 0,
            };
          }

          nextDetails[dateKey].count += 1;

          if (row.carrier_id && !nextDetails[dateKey].carrierIds.includes(row.carrier_id)) {
            nextDetails[dateKey].carrierIds.push(row.carrier_id);
          }

          if (row.carrier_id) {
            nextDetails[dateKey].carrierCounts[row.carrier_id] = (nextDetails[dateKey].carrierCounts[row.carrier_id] || 0) + 1;

            if (!nextDetails[dateKey].supplierIdsByCarrier[row.carrier_id]) {
              nextDetails[dateKey].supplierIdsByCarrier[row.carrier_id] = [];
            }

            if (!nextDetails[dateKey].supplierDetailsByCarrier[row.carrier_id]) {
              nextDetails[dateKey].supplierDetailsByCarrier[row.carrier_id] = {};
            }
          }

          row.receipt_items?.forEach(item => {
            nextDetails[dateKey].packageCount += item.package_count;

            if (row.carrier_id && !nextDetails[dateKey].supplierIdsByCarrier[row.carrier_id].includes(item.supplier_id)) {
              nextDetails[dateKey].supplierIdsByCarrier[row.carrier_id].push(item.supplier_id);
            }

            if (row.carrier_id) {
              if (!nextDetails[dateKey].supplierDetailsByCarrier[row.carrier_id][item.supplier_id]) {
                nextDetails[dateKey].supplierDetailsByCarrier[row.carrier_id][item.supplier_id] = {
                  boxes: 0,
                  pallets: 0,
                  batchIds: [],
                };
              }

              const supplierDetails = nextDetails[dateKey].supplierDetailsByCarrier[row.carrier_id][item.supplier_id];
              const value = item.package_type.toLowerCase();

              if ((value === 'box' || value === 'boxes')) {
                supplierDetails.boxes += item.package_count;
              }
              if (value === 'pallet' || value === 'pallets') {
                supplierDetails.pallets += item.package_count;
              }

              if (!supplierDetails.batchIds.includes(row.id)) {
                supplierDetails.batchIds.push(row.id);
              }
            }

            const value = item.package_type.toLowerCase();
            if (value === 'box' || value === 'boxes') {
              nextDetails[dateKey].boxCount += item.package_count;
            }
            if (value === 'pallet' || value === 'pallets') {
              nextDetails[dateKey].palletCount += item.package_count;
            }
          });
        });

        setDetailsByDate(nextDetails);
        setDates(Object.keys(nextDetails).map(d => new Date(`${d}T12:00:00`)));
      }
      } catch (err) {
        console.error('Failed to load receipt calendar details', err);
        setDates([]);
        setDetailsByDate({});
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { dates, detailsByDate, loading };
}

export async function saveBatch(
  batch: TablesInsert<'receipt_batches'>,
  items: TablesInsert<'receipt_items'>[]
) {
  if (shouldUseLocalData()) {
    return saveLocalBatch(batch, items, { queueSync: !isMockLocal });
  }

  let batchRow: ReceiptBatch | null = null;
  try {
    const { data, error: batchErr } = await supabase
      .from('receipt_batches')
      .insert(batch)
      .select()
      .single();
    if (batchErr) throw batchErr;
    batchRow = data;
  } catch (err) {
    console.warn('Batch saved offline because remote save failed', err);
    return saveLocalBatch(batch, items, { queueSync: true });
  }

  const itemsWithBatch = items.map(it => ({ ...it, batch_id: batchRow!.id }));
  const { data: itemRows, error: itemsErr } = await supabase.from('receipt_items').insert(itemsWithBatch).select();
  if (itemsErr) throw itemsErr;

  const supplierIds = Array.from(new Set((itemRows || []).map(item => item.supplier_id).filter(Boolean)));
  let expectedBoxesMatched = 0;
  let expectedBoxIdsMatched: string[] = [];

  if (supplierIds.length > 0) {
    const { data: expectedBoxes } = await expectedBoxesDb
      .from('expected_boxes')
      .select('id, supplier_id, po_number, match_condition')
      .in('supplier_id', supplierIds)
      .in('status', ['in_transit', 'delivered', 'needs_review']);

    const matchedBoxes: Array<{ id: string; item: ReceiptItem }> = [];
    const expectedBoxRows = (expectedBoxes || []) as ExpectedBoxMatch[];

    expectedBoxRows.forEach(box => {
      const match = (itemRows || []).find(item => {
        if (item.supplier_id !== box.supplier_id) return false;
        if (box.match_condition === 'supplier_only') return true;
        return (item.tracking_number || '').trim().toLowerCase() === (box.po_number || '').trim().toLowerCase();
      });

      if (match) {
        matchedBoxes.push({ id: box.id, item: match as ReceiptItem });
      }
    });

    if (matchedBoxes.length > 0) {
      const uniqueMatches = Array.from(new Map(matchedBoxes.map(match => [match.id, match])).values());
      for (const match of uniqueMatches) {
        const packageType = (match.item.package_type || '').trim().toLowerCase();
        const receivedBoxCount = packageType.includes('box') ? Math.max(0, match.item.package_count || 0) : 0;
        const { error: updateErr } = await expectedBoxesDb
          .from('expected_boxes')
          .update({
            status: 'received',
            warehouse_received_at: batchRow!.received_at,
            warehouse_received_box_count: receivedBoxCount,
            received_batch_id: batchRow!.id,
            received_item_id: match.item.id,
            warehouse_received_email_sent: false,
          })
          .eq('id', match.id);
        if (updateErr) throw updateErr;
      }
      expectedBoxesMatched = uniqueMatches.length;
      expectedBoxIdsMatched = uniqueMatches.map(match => match.id);
    }
  }

  return { ...batchRow!, expectedBoxesMatched, expectedBoxIdsMatched };
}

async function syncOfflineQueueItem(item: OfflineQueueItem) {
  if (item.action === 'supplier:create') {
    const { error } = await supabase.from('suppliers').upsert(item.payload).select().single();
    if (error) throw error;
    return;
  }

  if (item.action === 'carrier:create') {
    const { error } = await supabase.from('carriers').upsert(item.payload).select().single();
    if (error) throw error;
    return;
  }

  const { batch, items } = item.payload;
  const { error: batchError } = await supabase.from('receipt_batches').upsert(batch).select().single();
  if (batchError) throw batchError;
  if (items.length > 0) {
    const { error: itemsError } = await supabase.from('receipt_items').upsert(items).select();
    if (itemsError) throw itemsError;
  }
}

export async function syncPendingOfflineChanges() {
  if (isMockLocal || shouldUseLocalData()) {
    return { synced: 0, pending: getPendingOfflineChanges().length };
  }

  let synced = 0;
  for (const item of getPendingOfflineChanges()) {
    await syncOfflineQueueItem(item);
    removePendingOfflineChange(item.id);
    synced += 1;
  }

  return { synced, pending: getPendingOfflineChanges().length };
}

export async function sendExpectedBoxEmails(expectedBoxIds: string[]) {
  if (shouldUseLocalData()) return { sent: 0 };
  if (expectedBoxIds.length === 0) return { sent: 0 };
  return invokeProtectedFunction<{ sent: number; sentIds?: string[] }>('send-expected-box-emails', { expectedBoxIds });
}

export async function uploadPhoto(file: File, path: string): Promise<string> {
  if (shouldUseLocalData()) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || path));
      reader.onerror = () => reject(new Error('Failed to read local photo'));
      reader.readAsDataURL(file);
    });
  }

  const { error } = await supabase.storage
    .from('receipts_photos')
    .upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('receipts_photos').getPublicUrl(path);
  return data.publicUrl;
}
