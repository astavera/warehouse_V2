import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';

type Supplier = Tables<'suppliers'>;
type Carrier = Tables<'carriers'>;
type Employee = Tables<'employees'>;
type ReceiptBatch = Tables<'receipt_batches'>;
type ReceiptItem = Tables<'receipt_items'>;

export function useSuppliers() {
  const [data, setData] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase.from('suppliers').select('*').order('name');
    setData(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const add = async (s: TablesInsert<'suppliers'>) => {
    const { data: row, error } = await supabase.from('suppliers').insert(s).select().single();
    if (error) throw error;
    await fetch();
    return row!;
  };

  const update = async (id: string, patch: Partial<Supplier>) => {
    await supabase.from('suppliers').update(patch).eq('id', id);
    await fetch();
  };

  return { suppliers: data, loading, refetch: fetch, addSupplier: add, updateSupplier: update };
}

export function useCarriers() {
  const [data, setData] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase.from('carriers').select('*').order('name');
    setData(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const add = async (s: TablesInsert<'carriers'>) => {
    const { data: row, error } = await supabase.from('carriers').insert(s).select().single();
    if (error) throw error;
    await fetch();
    return row!;
  };

  const update = async (id: string, patch: Partial<Carrier>) => {
    await supabase.from('carriers').update(patch).eq('id', id);
    await fetch();
  };

  return { carriers: data, loading, refetch: fetch, addCarrier: add, updateCarrier: update };
}

export function useEmployees() {
  const [data, setData] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase.from('employees').select('*').order('name');
    setData(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const add = async (s: TablesInsert<'employees'>) => {
    const { data: row, error } = await supabase.from('employees').insert(s).select().single();
    if (error) throw error;
    await fetch();
    return row!;
  };

  const update = async (id: string, patch: Partial<Employee>) => {
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
    let query = supabase
      .from('receipt_batches')
      .select('*, receipt_items(*)')
      .order('received_at', { ascending: false });

    if (dateFilter) {
      query = query.gte('received_at', `${dateFilter}T00:00:00`).lte('received_at', `${dateFilter}T23:59:59`);
    }

    const { data } = await query;
    setData((data as BatchWithItems[]) || []);
    setLoading(false);
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
      const { data } = await supabase
        .from('receipt_batches')
        .select('received_at');
      if (data) {
        const unique = new Set(data.map(r => r.received_at.split('T')[0]));
        setDates(Array.from(unique).map(d => new Date(d + 'T12:00:00')));
      }
      setLoading(false);
    })();
  }, []);

  return { dates, loading };
}

export async function saveBatch(
  batch: TablesInsert<'receipt_batches'>,
  items: TablesInsert<'receipt_items'>[]
) {
  const { data: batchRow, error: batchErr } = await supabase
    .from('receipt_batches')
    .insert(batch)
    .select()
    .single();
  if (batchErr) throw batchErr;

  const itemsWithBatch = items.map(it => ({ ...it, batch_id: batchRow!.id }));
  const { error: itemsErr } = await supabase.from('receipt_items').insert(itemsWithBatch);
  if (itemsErr) throw itemsErr;

  return batchRow!;
}

export async function uploadPhoto(file: File, path: string): Promise<string> {
  const { error } = await supabase.storage
    .from('receipts_photos')
    .upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('receipts_photos').getPublicUrl(path);
  return data.publicUrl;
}
