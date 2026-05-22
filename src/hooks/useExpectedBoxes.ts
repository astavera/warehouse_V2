import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeProtectedFunction } from '@/lib/protectedFunctions';

export type ExpectedBoxStatus = 'in_transit' | 'delivered' | 'received' | 'needs_review';
export type ExpectedBoxCarrier = 'FedEx' | 'UPS' | 'USPS' | 'Amazon';
export type MatchCondition = 'supplier_only' | 'supplier_po';

export type ExpectedBox = {
  id: string;
  carrier: ExpectedBoxCarrier;
  tracking_number: string;
  supplier_id: string;
  po_number: string | null;
  match_condition: MatchCondition;
  status: ExpectedBoxStatus;
  carrier_eta: string | null;
  carrier_delivered_at: string | null;
  carrier_tracking_events?: CarrierTrackingEvent[] | null;
  warehouse_received_at: string | null;
  warehouse_received_box_count: number;
  last_carrier_event: string | null;
  notes: string | null;
  created_by_employee_id: string | null;
  received_batch_id: string | null;
  received_item_id: string | null;
  carrier_delivered_email_sent: boolean;
  warehouse_received_email_sent: boolean;
  created_at: string;
  updated_at: string;
  suppliers?: {
    name: string;
  } | null;
};

export type CarrierTrackingEvent = {
  message: string;
  status: string | null;
  datetime: string | null;
  location: string | null;
};

export type ExpectedBoxInsert = {
  carrier: ExpectedBoxCarrier;
  tracking_number: string;
  supplier_id: string;
  po_number?: string | null;
  match_condition: MatchCondition;
  status?: ExpectedBoxStatus;
  carrier_eta?: string | null;
  last_carrier_event?: string | null;
  notes?: string | null;
  created_by_employee_id?: string | null;
};

export type ExpectedBoxAccess = {
  id: string;
  employee_id: string;
  can_view: boolean;
  granted_by_employee_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ExpectedBoxRecipient = {
  id: string;
  name: string;
  email: string;
  notify_carrier_delivered: boolean;
  notify_warehouse_received: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type SupabaseResult = {
  data: unknown;
  error: Error | null;
};

type SupabaseQuery = PromiseLike<SupabaseResult> & {
  select: (...args: unknown[]) => SupabaseQuery;
  order: (...args: unknown[]) => SupabaseQuery;
  insert: (...args: unknown[]) => SupabaseQuery;
  update: (...args: unknown[]) => SupabaseQuery;
  delete: () => SupabaseQuery;
  eq: (...args: unknown[]) => SupabaseQuery;
  upsert: (...args: unknown[]) => SupabaseQuery;
  single: () => Promise<SupabaseResult>;
};

const db = supabase as unknown as {
  from: (table: string) => SupabaseQuery;
};

export function useExpectedBoxes() {
  const [boxes, setBoxes] = useState<ExpectedBox[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data, error } = await db
      .from('expected_boxes')
      .select('*, suppliers(name)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    setBoxes((data || []) as ExpectedBox[]);
    setLoading(false);
    return (data || []) as ExpectedBox[];
  }, []);

  useEffect(() => {
    void fetch().catch(() => setLoading(false));
  }, [fetch]);

  const addExpectedBox = async (payload: ExpectedBoxInsert) => {
    const { data, error } = await db
      .from('expected_boxes')
      .insert(payload)
      .select('*, suppliers(name)')
      .single();
    if (error) throw error;
    await fetch();
    return data as ExpectedBox;
  };

  const updateExpectedBox = async (id: string, patch: Partial<ExpectedBox>) => {
    const { error } = await db.from('expected_boxes').update(patch).eq('id', id);
    if (error) throw error;
    await fetch();
  };

  const deleteExpectedBox = async (id: string) => {
    const { error } = await db.from('expected_boxes').delete().eq('id', id);
    if (error) throw error;
    await fetch();
  };

  return { boxes, loading, refetch: fetch, addExpectedBox, updateExpectedBox, deleteExpectedBox };
}

export async function syncExpectedBoxTracking(expectedBoxId: string) {
  return invokeProtectedFunction<{ box: ExpectedBox; tracker: unknown }>('sync-expected-box-tracking', { expectedBoxId });
}

export function useExpectedBoxAccess() {
  const [access, setAccess] = useState<ExpectedBoxAccess[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data, error } = await db.from('expected_box_access').select('*');
    if (error) throw error;
    setAccess((data || []) as ExpectedBoxAccess[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetch().catch(() => setLoading(false));
  }, [fetch]);

  const grantAccess = async (employeeId: string, grantedByEmployeeId?: string | null) => {
    const { error } = await db
      .from('expected_box_access')
      .upsert(
        {
          employee_id: employeeId,
          can_view: true,
          granted_by_employee_id: grantedByEmployeeId || null,
        },
        { onConflict: 'employee_id' }
      );
    if (error) throw error;
    await fetch();
  };

  const revokeAccess = async (employeeId: string) => {
    const { error } = await db.from('expected_box_access').delete().eq('employee_id', employeeId);
    if (error) throw error;
    await fetch();
  };

  return { access, loading, refetch: fetch, grantAccess, revokeAccess };
}

export function useExpectedBoxRecipients() {
  const [recipients, setRecipients] = useState<ExpectedBoxRecipient[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data, error } = await db
      .from('expected_box_notification_recipients')
      .select('*')
      .order('name');
    if (error) throw error;
    setRecipients((data || []) as ExpectedBoxRecipient[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetch().catch(() => setLoading(false));
  }, [fetch]);

  const addRecipient = async (payload: Pick<ExpectedBoxRecipient, 'name' | 'email'>) => {
    const { error } = await db.from('expected_box_notification_recipients').insert(payload);
    if (error) throw error;
    await fetch();
  };

  const updateRecipient = async (id: string, patch: Partial<ExpectedBoxRecipient>) => {
    const { error } = await db.from('expected_box_notification_recipients').update(patch).eq('id', id);
    if (error) throw error;
    await fetch();
  };

  return { recipients, loading, refetch: fetch, addRecipient, updateRecipient };
}
