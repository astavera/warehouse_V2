import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import nodemailer from 'npm:nodemailer@6.9.16';

type Recipient = {
  email: string;
  name: string;
  notify_warehouse_received: boolean;
  active: boolean;
};

type ExpectedBox = {
  id: string;
  tracking_number: string;
  carrier: string;
  po_number: string | null;
  warehouse_received_at: string | null;
  warehouse_received_email_sent: boolean;
  suppliers: {
    name: string;
  } | null;
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

function formatDate(value: string | null) {
  if (!value) return 'Unknown time';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/New_York',
  }).format(new Date(value));
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

async function sendEmail({
  resendApiKey,
  gmailUser,
  gmailAppPassword,
  fromEmail,
  recipients,
  boxes,
}: {
  resendApiKey: string | null;
  gmailUser: string | null;
  gmailAppPassword: string | null;
  fromEmail: string;
  recipients: Recipient[];
  boxes: ExpectedBox[];
}) {
  const to = recipients.filter(recipient => recipient.active && recipient.notify_warehouse_received).map(recipient => recipient.email);
  if (to.length === 0) {
    return { skipped: true };
  }
  if (boxes.length === 0) {
    return { skipped: true };
  }

  const boxCount = boxes.length;
  const supplierNames = [...new Set(boxes.map(box => box.suppliers?.name || 'Unknown supplier'))];
  const supplierSummary = supplierNames.length === 1 ? supplierNames[0] : `${supplierNames.length} suppliers`;
  const subject = `Warehouse received: ${boxCount} box${boxCount === 1 ? '' : 'es'} from ${supplierSummary}`;
  const rows = boxes
    .map(box => {
      const supplierName = box.suppliers?.name || 'Unknown supplier';
      const receivedAt = formatDate(box.warehouse_received_at);
      return `
        <tr>
          <td style="padding: 8px; border: 1px solid #e5e7eb;">${supplierName}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb;">${box.carrier}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb;">${box.tracking_number}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb;">${box.po_number || 'Not required'}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb;">${receivedAt}</td>
        </tr>
      `;
    })
    .join('');
  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <h2 style="margin: 0 0 12px;">${boxCount} expected box${boxCount === 1 ? '' : 'es'} received in warehouse</h2>
      <p style="margin: 0 0 16px;">Receiving matched ${boxCount} expected box${boxCount === 1 ? '' : 'es'}.</p>
      <table style="border-collapse: collapse; width: 100%; max-width: 760px;">
        <thead>
          <tr>
            <th align="left" style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb;">Supplier</th>
            <th align="left" style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb;">Carrier</th>
            <th align="left" style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb;">Tracking</th>
            <th align="left" style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb;">P.O</th>
            <th align="left" style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb;">WH received</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  if (gmailUser && gmailAppPassword) {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailAppPassword,
      },
    });

    return transporter.sendMail({
      from: fromEmail || gmailUser,
      to,
      subject,
      html,
    });
  }

  if (!resendApiKey) {
    throw new Error('Missing email provider secret. Configure Gmail SMTP or RESEND_API_KEY.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Resend failed: ${response.status} ${errorBody}`);
  }

  return response.json();
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const gmailUser = Deno.env.get('GMAIL_SMTP_USER');
    const gmailAppPassword = Deno.env.get('GMAIL_SMTP_APP_PASSWORD');
    const fromEmail = Deno.env.get('EXPECTED_BOX_FROM_EMAIL') || gmailUser || 'Modern State Warehouse <notifications@modernstate.app>';

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Missing Supabase function secrets' }, 500);
    }
    await requireAuthenticatedUser(req, supabaseUrl, serviceRoleKey);
    if (!resendApiKey && (!gmailUser || !gmailAppPassword)) {
      return jsonResponse({ error: 'Missing email provider secrets' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const payload = await req.json().catch(() => ({}));
    const expectedBoxIds = Array.isArray(payload.expectedBoxIds) ? payload.expectedBoxIds : [];

    let query = supabase
      .from('expected_boxes')
      .select('id, tracking_number, carrier, po_number, warehouse_received_at, warehouse_received_email_sent, suppliers(name)')
      .eq('status', 'received')
      .eq('warehouse_received_email_sent', false);

    if (expectedBoxIds.length > 0) {
      query = query.in('id', expectedBoxIds);
    }

    const { data: boxes, error: boxesError } = await query;
    if (boxesError) throw boxesError;

    const { data: recipients, error: recipientsError } = await supabase
      .from('expected_box_notification_recipients')
      .select('email, name, notify_warehouse_received, active')
      .eq('active', true)
      .eq('notify_warehouse_received', true);

    if (recipientsError) throw recipientsError;

    const sentIds: string[] = [];

    const matchedBoxes = (boxes || []) as ExpectedBox[];

    if (matchedBoxes.length > 0) {
      const emailResult = await sendEmail({
        resendApiKey,
        gmailUser: gmailUser || null,
        gmailAppPassword: gmailAppPassword || null,
        fromEmail,
        recipients: (recipients || []) as Recipient[],
        boxes: matchedBoxes,
      });

      if (!('skipped' in emailResult)) {
        const ids = matchedBoxes.map(box => box.id);
        const { error: updateError } = await supabase
          .from('expected_boxes')
          .update({ warehouse_received_email_sent: true })
          .in('id', ids);

        if (updateError) throw updateError;
        sentIds.push(...ids);
      }
    }

    return jsonResponse({ sent: sentIds.length, sentIds });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
