import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

type ExpectedBox = {
  id: string;
  carrier: 'FedEx' | 'UPS' | 'USPS' | 'Amazon';
  tracking_number: string;
  status: 'in_transit' | 'delivered' | 'received' | 'needs_review';
  warehouse_received_at: string | null;
};

type EasyPostTrackingDetail = {
  message?: string;
  status?: string;
  datetime?: string;
  tracking_location?: {
    city?: string;
    state?: string;
    country?: string;
    zip?: string;
  };
};

type EasyPostTracker = {
  status?: string;
  status_detail?: string;
  est_delivery_date?: string;
  updated_at?: string;
  tracking_details?: EasyPostTrackingDetail[];
};

type Ship24Event = {
  status?: string;
  occurrenceDatetime?: string;
  location?: string;
  statusCode?: string | null;
  statusCategory?: string | null;
  statusMilestone?: string | null;
};

type Ship24Tracking = {
  tracker?: {
    trackerId?: string;
  };
  shipment?: {
    statusCode?: string | null;
    statusCategory?: string | null;
    statusMilestone?: string | null;
    delivery?: {
      estimatedDeliveryDate?: string | null;
      courierEstimatedDeliveryDate?: {
        from?: string | null;
        to?: string | null;
      } | null;
    } | null;
  };
  events?: Ship24Event[];
};

type Ship24Response = {
  data?: {
    trackings?: Ship24Tracking[];
  };
  errors?: unknown;
  error?: unknown;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error) {
    if ('message' in error && typeof error.message === 'string') return error.message;
    return JSON.stringify(error);
  }
  return String(error || 'Unknown error');
}

function easyPostCarrier(carrier: ExpectedBox['carrier']) {
  if (carrier === 'Amazon') return 'AmazonShipping';
  return carrier;
}

function trackingLocation(detail: EasyPostTrackingDetail) {
  const location = detail.tracking_location;
  if (!location) return null;
  return [location.city, location.state, location.zip, location.country].filter(Boolean).join(', ') || null;
}

function normalizeEvents(details: EasyPostTrackingDetail[] = []) {
  return [...details]
    .sort((a, b) => new Date(b.datetime || 0).getTime() - new Date(a.datetime || 0).getTime())
    .map(detail => ({
      message: detail.message || detail.status || 'Carrier update',
      status: detail.status || null,
      datetime: detail.datetime || null,
      location: trackingLocation(detail),
    }));
}

function normalizeShip24Events(events: Ship24Event[] = []) {
  return [...events]
    .sort((a, b) => new Date(b.occurrenceDatetime || 0).getTime() - new Date(a.occurrenceDatetime || 0).getTime())
    .map(event => ({
      message: event.status || event.statusMilestone || event.statusCode || 'Carrier update',
      status: event.statusMilestone || event.statusCode || event.statusCategory || null,
      datetime: event.occurrenceDatetime || null,
      location: event.location || null,
    }));
}

async function fetchShip24Tracking(apiKey: string, box: ExpectedBox) {
  const response = await fetch('https://api.ship24.com/public/v1/trackers/track', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      trackingNumber: box.tracking_number,
      clientTrackerId: box.id,
      shipmentReference: box.id,
    }),
  });

  const body = await response.json().catch(async () => ({ error: await response.text() })) as Ship24Response;
  if (!response.ok) {
    return { ok: false as const, status: response.status, body };
  }

  const tracking = body.data?.trackings?.[0];
  if (!tracking) {
    return { ok: false as const, status: 404, body: { error: 'Ship24 returned no tracking results', details: body } };
  }

  const events = normalizeShip24Events(tracking.events || []);
  const latestEvent = events[0];
  const delivered = tracking.shipment?.statusMilestone === 'delivered' || tracking.shipment?.statusCode === 'delivery_delivered';
  const eta =
    tracking.shipment?.delivery?.estimatedDeliveryDate ||
    tracking.shipment?.delivery?.courierEstimatedDeliveryDate?.to ||
    tracking.shipment?.delivery?.courierEstimatedDeliveryDate?.from ||
    null;

  return {
    ok: true as const,
    provider: 'ship24',
    raw: body,
    events,
    latestEvent,
    delivered,
    eta,
    lastEvent: latestEvent?.message || tracking.shipment?.statusMilestone || tracking.shipment?.statusCode || 'Carrier tracking updated',
    deliveredAt: delivered ? latestEvent?.datetime || new Date().toISOString() : null,
  };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const ship24ApiKey = Deno.env.get('SHIP24_API_KEY');
    const easyPostApiKey = Deno.env.get('EASYPOST_API_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Missing Supabase function secrets' }, 500);
    }
    if (!ship24ApiKey && !easyPostApiKey) {
      return jsonResponse({ error: 'Missing tracking provider secret. Configure SHIP24_API_KEY or EASYPOST_API_KEY.' }, 500);
    }

    const payload = await req.json().catch(() => ({}));
    const expectedBoxId = typeof payload.expectedBoxId === 'string' ? payload.expectedBoxId : '';
    if (!expectedBoxId) {
      return jsonResponse({ error: 'Missing expectedBoxId' }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: box, error: boxError } = await supabase
      .from('expected_boxes')
      .select('id, carrier, tracking_number, status, warehouse_received_at')
      .eq('id', expectedBoxId)
      .single();

    if (boxError) {
      return jsonResponse({ error: errorMessage(boxError) }, 404);
    }
    const expectedBox = box as ExpectedBox;

    if (ship24ApiKey) {
      const result = await fetchShip24Tracking(ship24ApiKey, expectedBox);
      if (!result.ok) {
        return jsonResponse({ error: 'Ship24 tracking request failed', details: result.body }, result.status);
      }

      const nextStatus = expectedBox.status === 'received' ? 'received' : result.delivered ? 'delivered' : 'in_transit';
      const updatePayload: Record<string, unknown> = {
        status: nextStatus,
        carrier_eta: result.eta,
        carrier_delivered_at: result.deliveredAt,
        carrier_tracking_events: result.events,
        last_carrier_event: result.lastEvent,
      };

      if (result.delivered) {
        updatePayload.carrier_delivered_email_sent = false;
      }

      const { data: updatedBox, error: updateError } = await supabase
        .from('expected_boxes')
        .update(updatePayload)
        .eq('id', expectedBox.id)
        .select('*, suppliers(name)')
        .single();

      if (updateError) throw updateError;

      return jsonResponse({ box: updatedBox, tracker: result.raw, provider: result.provider });
    }

    if (!easyPostApiKey) {
      return jsonResponse({ error: 'Missing EASYPOST_API_KEY secret' }, 500);
    }

    const trackerResponse = await fetch('https://api.easypost.com/v2/trackers', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${easyPostApiKey}:`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tracker: {
          tracking_code: expectedBox.tracking_number,
          carrier: easyPostCarrier(expectedBox.carrier),
        },
      }),
    });

    const trackerBody = await trackerResponse.json().catch(async () => ({ error: await trackerResponse.text() }));
    if (!trackerResponse.ok) {
      return jsonResponse({ error: 'EasyPost tracking request failed', details: trackerBody }, trackerResponse.status);
    }

    const tracker = trackerBody as EasyPostTracker;
    const events = normalizeEvents(tracker.tracking_details || []);
    const latestEvent = events[0];
    const delivered = tracker.status === 'delivered';
    const nextStatus = expectedBox.status === 'received' ? 'received' : delivered ? 'delivered' : 'in_transit';
    const updatePayload: Record<string, unknown> = {
      status: nextStatus,
      carrier_eta: tracker.est_delivery_date || null,
      carrier_delivered_at: delivered ? latestEvent?.datetime || tracker.updated_at || new Date().toISOString() : null,
      carrier_tracking_events: events,
      last_carrier_event: latestEvent?.message || tracker.status_detail || tracker.status || 'Carrier tracking updated',
    };

    if (delivered) {
      updatePayload.carrier_delivered_email_sent = false;
    }

    const { data: updatedBox, error: updateError } = await supabase
      .from('expected_boxes')
      .update(updatePayload)
      .eq('id', expectedBox.id)
      .select('*, suppliers(name)')
      .single();

    if (updateError) throw updateError;

    return jsonResponse({ box: updatedBox, tracker });
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 500);
  }
});
