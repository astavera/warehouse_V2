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

type FedExTrackResult = {
  latestStatusDetail?: {
    code?: string;
    derivedCode?: string;
    description?: string;
    statusByLocale?: string;
    scanLocation?: {
      city?: string;
      stateOrProvinceCode?: string;
      postalCode?: string;
      countryCode?: string;
    };
  };
  dateAndTimes?: {
    type?: string;
    dateTime?: string;
  }[];
  scanEvents?: {
    eventDescription?: string;
    eventType?: string;
    date?: string;
    scanLocation?: {
      city?: string;
      stateOrProvinceCode?: string;
      postalCode?: string;
      countryCode?: string;
    };
  }[];
  packageCount?: number;
};

type FedExTrackResponse = {
  output?: {
    completeTrackResults?: {
      trackResults?: FedExTrackResult[];
    }[];
  };
  errors?: unknown;
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
    packageCount?: number | null;
    numberOfPieces?: number | null;
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

type NormalizedTrackingResult = {
  provider: string;
  raw: unknown;
  events: {
    message: string;
    status: string | null;
    datetime: string | null;
    location: string | null;
  }[];
  latestEvent?: {
    message: string;
    status: string | null;
    datetime: string | null;
    location: string | null;
  };
  delivered: boolean;
  eta: string | null;
  lastEvent: string;
  deliveredAt: string | null;
  shippedCount: number | null;
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

async function requireAuthenticatedUser(req: Request, supabaseUrl: string, serviceRoleKey: string) {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('Authentication required');

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error('Authentication required');
  return data.user;
}

function easyPostCarrier(carrier: ExpectedBox['carrier']) {
  if (carrier === 'Amazon') return 'AmazonShipping';
  return carrier;
}

function ship24CourierCode(carrier: ExpectedBox['carrier']) {
  if (carrier === 'FedEx') return 'fedex';
  if (carrier === 'UPS') return 'ups';
  if (carrier === 'USPS') return 'usps';
  if (carrier === 'Amazon') return 'amazon';
  return null;
}

function trackingLocation(detail: EasyPostTrackingDetail) {
  const location = detail.tracking_location;
  if (!location) return null;
  return [location.city, location.state, location.zip, location.country].filter(Boolean).join(', ') || null;
}

function fedExLocation(location?: FedExTrackResult['latestStatusDetail']['scanLocation']) {
  if (!location) return null;
  return [location.city, location.stateOrProvinceCode, location.postalCode, location.countryCode].filter(Boolean).join(', ') || null;
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

async function fetchFedExTracking(apiKey: string, secretKey: string, box: ExpectedBox) {
  const apiBase = Deno.env.get('FEDEX_API_BASE') || 'https://apis.fedex.com';
  const tokenResponse = await fetch(`${apiBase}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: apiKey,
      client_secret: secretKey,
    }),
  });

  const tokenBody = await tokenResponse.json().catch(async () => ({ error: await tokenResponse.text() }));
  if (!tokenResponse.ok || typeof tokenBody.access_token !== 'string') {
    return { ok: false as const, status: tokenResponse.status, body: tokenBody };
  }

  const trackingResponse = await fetch(`${apiBase}/track/v1/trackingnumbers`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenBody.access_token}`,
      'Content-Type': 'application/json',
      'X-locale': 'en_US',
    },
    body: JSON.stringify({
      includeDetailedScans: true,
      trackingInfo: [
        {
          trackingNumberInfo: {
            trackingNumber: box.tracking_number,
          },
        },
      ],
    }),
  });

  const body = await trackingResponse.json().catch(async () => ({ error: await trackingResponse.text() })) as FedExTrackResponse;
  if (!trackingResponse.ok) {
    return { ok: false as const, status: trackingResponse.status, body };
  }

  const trackResult = body.output?.completeTrackResults?.[0]?.trackResults?.[0];
  if (!trackResult) {
    return { ok: false as const, status: 404, body: { error: 'FedEx returned no tracking results', details: body } };
  }

  const events = [...(trackResult.scanEvents || [])]
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
    .map(event => ({
      message: event.eventDescription || event.eventType || 'FedEx update',
      status: event.eventType || null,
      datetime: event.date || null,
      location: fedExLocation(event.scanLocation),
    }));
  const latestEvent = events[0];
  const status = trackResult.latestStatusDetail;
  const delivered =
    status?.code === 'DL' ||
    status?.derivedCode === 'DL' ||
    (status?.description || status?.statusByLocale || '').toLowerCase().includes('delivered');
  const eta =
    trackResult.dateAndTimes?.find(item => item.type === 'ESTIMATED_DELIVERY')?.dateTime ||
    trackResult.dateAndTimes?.find(item => item.type === 'ACTUAL_DELIVERY')?.dateTime ||
    null;

  const shippedCount = typeof trackResult.packageCount === 'number' && trackResult.packageCount > 0
    ? trackResult.packageCount
    : null;

  return {
    ok: true as const,
    provider: 'fedex',
    raw: body,
    events,
    latestEvent,
    delivered,
    eta,
    lastEvent:
      latestEvent?.message ||
      status?.description ||
      status?.statusByLocale ||
      status?.derivedCode ||
      status?.code ||
      'FedEx tracking updated',
    deliveredAt: delivered ? latestEvent?.datetime || trackResult.dateAndTimes?.find(item => item.type === 'ACTUAL_DELIVERY')?.dateTime || new Date().toISOString() : null,
    shippedCount,
  };
}

async function fetchShip24Tracking(apiKey: string, box: ExpectedBox) {
  const courierCode = ship24CourierCode(box.carrier);
  const normalizedTrackingNumber = box.tracking_number.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const clientTrackerId = courierCode ? `${courierCode}-${normalizedTrackingNumber}` : box.id;
  const response = await fetch('https://api.ship24.com/public/v1/trackers/track', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      trackingNumber: box.tracking_number,
      ...(courierCode ? { courierCode: [courierCode] } : {}),
      clientTrackerId,
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

  const ship24PackageCount = tracking.shipment?.packageCount ?? tracking.shipment?.numberOfPieces ?? null;
  const shippedCount = typeof ship24PackageCount === 'number' && ship24PackageCount > 0 ? ship24PackageCount : null;

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
    shippedCount,
  };
}

async function updateExpectedBoxWithTracking(
  supabase: ReturnType<typeof createClient>,
  expectedBox: ExpectedBox,
  result: NormalizedTrackingResult
) {
  const nextStatus = expectedBox.status === 'received' ? 'received' : result.delivered ? 'delivered' : 'in_transit';
  const updatePayload: Record<string, unknown> = {
    status: nextStatus,
    carrier_eta: result.eta,
    carrier_delivered_at: result.deliveredAt,
    carrier_tracking_events: result.events,
    last_carrier_event: result.lastEvent,
    ...(result.shippedCount != null ? { carrier_shipped_count: result.shippedCount } : {}),
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
  return updatedBox;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const fedExApiKey = Deno.env.get('FEDEX_API_KEY');
    const fedExSecretKey = Deno.env.get('FEDEX_SECRET_KEY');
    const ship24ApiKey = Deno.env.get('SHIP24_API_KEY');
    const easyPostApiKey = Deno.env.get('EASYPOST_API_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Missing Supabase function secrets' }, 500);
    }
    await requireAuthenticatedUser(req, supabaseUrl, serviceRoleKey);
    if (!fedExApiKey && !ship24ApiKey && !easyPostApiKey) {
      return jsonResponse({ error: 'Missing tracking provider secret. Configure FEDEX_API_KEY, SHIP24_API_KEY, or EASYPOST_API_KEY.' }, 500);
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
    let ship24Fallback: NormalizedTrackingResult | null = null;

    if (ship24ApiKey) {
      const result = await fetchShip24Tracking(ship24ApiKey, expectedBox);
      if (!result.ok) {
        if (!easyPostApiKey) {
          return jsonResponse({ error: 'Ship24 tracking request failed', details: result.body }, result.status);
        }
      } else {
        const hasUsefulShip24Result =
          result.events.length > 0 ||
          result.delivered ||
          Boolean(result.eta) ||
          result.lastEvent.toLowerCase() !== 'pending';

        if (hasUsefulShip24Result || !easyPostApiKey) {
          const updatedBox = await updateExpectedBoxWithTracking(supabase, expectedBox, result);
          return jsonResponse({ box: updatedBox, tracker: result.raw, provider: result.provider });
        }
        ship24Fallback = result;
      }
    }

    const fedExApiBase = Deno.env.get('FEDEX_API_BASE') || '';
    const canUseFedExProduction = expectedBox.carrier === 'FedEx' && fedExApiKey && fedExSecretKey && !fedExApiBase.includes('sandbox');
    if (canUseFedExProduction) {
      const result = await fetchFedExTracking(fedExApiKey, fedExSecretKey, expectedBox);
      if (result.ok) {
        const updatedBox = await updateExpectedBoxWithTracking(supabase, expectedBox, result);
        return jsonResponse({ box: updatedBox, tracker: result.raw, provider: result.provider });
      }
      if (!easyPostApiKey && !ship24Fallback) {
        return jsonResponse({ error: 'FedEx tracking request failed', details: result.body }, result.status);
      }
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
      if (ship24Fallback) {
        const updatedBox = await updateExpectedBoxWithTracking(supabase, expectedBox, ship24Fallback);
        return jsonResponse({
          box: updatedBox,
          tracker: ship24Fallback.raw,
          provider: ship24Fallback.provider,
          fallback_error: trackerBody,
        });
      }
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
      // EasyPost does not reliably expose package count; left as-is (not updated)
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

    return jsonResponse({ box: updatedBox, tracker, provider: 'easypost' });
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 500);
  }
});
