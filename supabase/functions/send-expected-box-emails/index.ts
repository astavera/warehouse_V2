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
  warehouse_received_box_count: number;
  warehouse_received_email_sent: boolean;
  notes: string | null;
  batch_group_id: string | null;
  suppliers: {
    name: string;
  } | null;
};

type Employee = {
  id?: string | null;
  auth_user_id?: string | null;
  role?: string | null;
  permissions?: string[] | null;
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

function escapeHtml(value: string | null | undefined) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function canAccessModule(employee: Employee, module: 'receiving' | 'expected_boxes') {
  const permissions = Array.isArray(employee.permissions) ? employee.permissions : [];
  if (employee.role === 'admin') return true;
  if (module === 'receiving') {
    return employee.role === 'warehouse' || employee.role === 'accounting' || permissions.includes('receiving');
  }
  return employee.role === 'accounting' || permissions.includes('expected_boxes');
}

async function requireModuleAccess(
  req: Request,
  supabaseUrl: string,
  serviceRoleKey: string,
  modules: Array<'receiving' | 'expected_boxes'>
) {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('Authentication required');

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error('Authentication required');
  const employeeId = typeof data.user.user_metadata?.employee_id === 'string' ? data.user.user_metadata.employee_id : null;

  const employeeSelect = 'id, auth_user_id, role, permissions';
  let employee: Employee | null = null;

  if (employeeId) {
    const { data: employeeById, error: employeeByIdError } = await supabase
      .from('employees')
      .select(employeeSelect)
      .eq('id', employeeId)
      .eq('active', true)
      .maybeSingle();
    if (employeeByIdError) throw employeeByIdError;
    employee = employeeById as Employee | null;
  }

  if (!employee) {
    const { data: employeeByAuth, error: employeeByAuthError } = await supabase
      .from('employees')
      .select(employeeSelect)
      .eq('auth_user_id', data.user.id)
      .eq('active', true)
      .maybeSingle();
    if (employeeByAuthError) throw employeeByAuthError;
    employee = employeeByAuth as Employee | null;
  }

  if (!employee || !modules.some(module => canAccessModule(employee as Employee, module))) {
    const accessError = new Error('Expected Boxes access required');
    accessError.name = 'Forbidden';
    throw accessError;
  }
  return employee as Employee;
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

  // Group boxes: batch_group_id → boxes; singles get their own group
  type BoxGroup = { batchGroupId: string | null; supplierName: string; carrier: string; boxes: ExpectedBox[] };
  const batchMap = new Map<string, BoxGroup>();
  const groups: BoxGroup[] = [];
  for (const box of boxes) {
    if (box.batch_group_id) {
      if (!batchMap.has(box.batch_group_id)) {
        const group: BoxGroup = { batchGroupId: box.batch_group_id, supplierName: box.suppliers?.name || 'Unknown supplier', carrier: box.carrier, boxes: [] };
        batchMap.set(box.batch_group_id, group);
        groups.push(group);
      }
      batchMap.get(box.batch_group_id)!.boxes.push(box);
    } else {
      groups.push({ batchGroupId: null, supplierName: box.suppliers?.name || 'Unknown supplier', carrier: box.carrier, boxes: [box] });
    }
  }

  // Total boxes = sum of warehouse_received_box_count (batch logic already ensures no double-counting)
  const totalBoxCount = boxes.reduce((sum, box) => sum + Math.max(0, box.warehouse_received_box_count || 0), 0);
  const boxCount = totalBoxCount || boxes.length;
  const supplierNames = [...new Set(boxes.map(box => box.suppliers?.name || 'Unknown supplier'))];
  const supplierSummary = supplierNames.length === 1 ? supplierNames[0] : `${supplierNames.length} suppliers`;
  const subject = `Warehouse received: ${boxCount} box${boxCount === 1 ? '' : 'es'} from ${supplierSummary}`;

  const groupSections = groups.map(group => {
    const groupBoxCount = group.boxes.reduce((sum, b) => sum + Math.max(0, b.warehouse_received_box_count || 0), 0);
    const receivedAt = formatDate(group.boxes[0]?.warehouse_received_at);
    const isBatch = group.boxes.length > 1;

    const trackingRows = group.boxes.map(box => `
      <tr>
        <td style="padding: 7px 8px; border: 1px solid #e5e7eb;">${escapeHtml(box.tracking_number)}</td>
        <td style="padding: 7px 8px; border: 1px solid #e5e7eb;">${escapeHtml(box.po_number || '—')}</td>
        <td style="padding: 7px 8px; border: 1px solid #e5e7eb;">${escapeHtml(box.notes || '')}</td>
      </tr>
    `).join('');

    const header = isBatch
      ? `<div style="margin: 0 0 6px; font-weight: 700; font-size: 14px; color: #111827;">
           ${escapeHtml(group.supplierName)} — ${escapeHtml(group.carrier)}
           <span style="margin-left: 8px; font-weight: 400; font-size: 12px; color: #6b7280;">${groupBoxCount} box${groupBoxCount === 1 ? '' : 'es'} received · ${receivedAt}</span>
         </div>`
      : '';

    return `
      <div style="margin-bottom: 20px;">
        ${header}
        <table style="border-collapse: collapse; width: 100%; max-width: 860px;">
          <thead>
            <tr>
              ${!isBatch ? `<th align="left" style="padding: 7px 8px; border: 1px solid #e5e7eb; background: #f9fafb; font-size: 12px;">Supplier</th>` : ''}
              ${!isBatch ? `<th align="left" style="padding: 7px 8px; border: 1px solid #e5e7eb; background: #f9fafb; font-size: 12px;">Carrier</th>` : ''}
              <th align="left" style="padding: 7px 8px; border: 1px solid #e5e7eb; background: #f9fafb; font-size: 12px;">Tracking number</th>
              <th align="left" style="padding: 7px 8px; border: 1px solid #e5e7eb; background: #f9fafb; font-size: 12px;">P.O</th>
              ${!isBatch ? `<th align="left" style="padding: 7px 8px; border: 1px solid #e5e7eb; background: #f9fafb; font-size: 12px;">Boxes received</th>` : ''}
              ${!isBatch ? `<th align="left" style="padding: 7px 8px; border: 1px solid #e5e7eb; background: #f9fafb; font-size: 12px;">WH received</th>` : ''}
              <th align="left" style="padding: 7px 8px; border: 1px solid #e5e7eb; background: #f9fafb; font-size: 12px;">Notes</th>
            </tr>
          </thead>
          <tbody>
            ${isBatch ? trackingRows : group.boxes.map(box => `
              <tr>
                <td style="padding: 7px 8px; border: 1px solid #e5e7eb;">${escapeHtml(box.suppliers?.name || 'Unknown supplier')}</td>
                <td style="padding: 7px 8px; border: 1px solid #e5e7eb;">${escapeHtml(box.carrier)}</td>
                <td style="padding: 7px 8px; border: 1px solid #e5e7eb;">${escapeHtml(box.tracking_number)}</td>
                <td style="padding: 7px 8px; border: 1px solid #e5e7eb;">${escapeHtml(box.po_number || '—')}</td>
                <td style="padding: 7px 8px; border: 1px solid #e5e7eb;">${box.warehouse_received_box_count || 0}</td>
                <td style="padding: 7px 8px; border: 1px solid #e5e7eb;">${formatDate(box.warehouse_received_at)}</td>
                <td style="padding: 7px 8px; border: 1px solid #e5e7eb;">${escapeHtml(box.notes || '')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }).join('');

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <h2 style="margin: 0 0 4px;">${boxCount} box${boxCount === 1 ? '' : 'es'} received in warehouse</h2>
      <p style="margin: 0 0 20px; color: #6b7280; font-size: 13px;">Receiving matched ${boxes.length} expected tracking record${boxes.length === 1 ? '' : 's'} from ${supplierSummary}.</p>
      ${groupSections}
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
    await requireModuleAccess(req, supabaseUrl, serviceRoleKey, ['receiving', 'expected_boxes']);
    if (!resendApiKey && (!gmailUser || !gmailAppPassword)) {
      return jsonResponse({ error: 'Missing email provider secrets' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const payload = await req.json().catch(() => ({}));
    const expectedBoxIds = Array.isArray(payload.expectedBoxIds)
      ? payload.expectedBoxIds.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
      : [];
    if (expectedBoxIds.length === 0) {
      return jsonResponse({ error: 'expectedBoxIds is required' }, 400);
    }
    if (expectedBoxIds.length > 100) {
      return jsonResponse({ error: 'Too many expected boxes requested' }, 400);
    }

    let query = supabase
      .from('expected_boxes')
      .select('id, tracking_number, carrier, po_number, warehouse_received_at, warehouse_received_box_count, warehouse_received_email_sent, notes, batch_group_id, suppliers(name)')
      .eq('status', 'received')
      .eq('warehouse_received_email_sent', false);

    query = query.in('id', expectedBoxIds);

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
    const status = error instanceof Error && error.name === 'Forbidden'
      ? 403
      : error instanceof Error && error.message === 'Authentication required'
        ? 401
        : 500;
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, status);
  }
});
