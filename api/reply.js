// POST /api/reply  { access_token, email, ticket_id, body?, status? }
// Appends a message to a ticket thread after OTP verification.
// Admins reply as "Helpdesk" and may set status; users may only reply to their own tickets.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['new', 'open', 'answered', 'resolved', 'closed'];

function baseUrl(u) {
  return String(u || '').trim().replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/, '');
}
function readJson(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => { d += c; });
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch (e) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}
function adminList() {
  return (process.env.ADMIN_EMAILS || 'support@blackbeltcodelabs.com')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }

  const body = await readJson(req);
  const accessToken = String(body.access_token || '');
  const email = String(body.email || '').trim();
  const ticketId = String(body.ticket_id || '').trim();
  const replyBody = String(body.body || '').trim();
  const wantStatus = body.status ? String(body.status).trim() : '';

  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Valid email required.' });
  if (!accessToken) return res.status(401).json({ error: 'Please verify your email first.' });
  if (!UUID_RE.test(ticketId)) return res.status(400).json({ error: 'Invalid ticket.' });
  if (!replyBody && !wantStatus) return res.status(400).json({ error: 'Nothing to send.' });

  const SUPABASE_URL = baseUrl(process.env.SUPABASE_URL);
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const REST_URL = baseUrl(process.env.SUPABASE_REST_URL) || SUPABASE_URL;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Message center is not configured yet.' });
  }

  // 1) Verify the OTP session.
  let verifiedEmail = '';
  try {
    const ures = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` }
    });
    const user = await ures.json().catch(() => ({}));
    if (!ures.ok || !user.email || String(user.email).toLowerCase() !== email.toLowerCase()) {
      return res.status(401).json({ error: 'Email verification failed. Please verify again.' });
    }
    verifiedEmail = String(user.email).toLowerCase();
  } catch (e) {
    return res.status(502).json({ error: 'Could not confirm verification.' });
  }

  const isAdmin = adminList().includes(verifiedEmail);
  const svc = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };

  // 2) Load the ticket and enforce ownership.
  let ticket;
  try {
    const tRes = await fetch(`${REST_URL}/rest/v1/contact_tickets?id=eq.${ticketId}&select=id,email,status`, { headers: svc });
    const rows = await tRes.json().catch(() => []);
    ticket = rows[0];
  } catch (e) {
    return res.status(502).json({ error: 'Could not load the ticket.' });
  }
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
  if (!isAdmin && String(ticket.email).toLowerCase() !== verifiedEmail) {
    return res.status(403).json({ error: 'You can only reply to your own tickets.' });
  }

  // 3) Append the message (if any).
  if (replyBody) {
    try {
      const ins = await fetch(`${REST_URL}/rest/v1/ticket_messages`, {
        method: 'POST',
        headers: { ...svc, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          ticket_id: ticketId,
          author: isAdmin ? 'admin' : 'user',
          author_email: verifiedEmail,
          body: replyBody
        })
      });
      if (!ins.ok) return res.status(502).json({ error: 'Could not send your reply.' });
    } catch (e) {
      return res.status(502).json({ error: 'Could not send your reply.' });
    }
  }

  // 4) Update status. Admin may set it explicitly; otherwise a reply nudges it.
  let newStatus = ticket.status;
  if (isAdmin && wantStatus && STATUSES.includes(wantStatus)) newStatus = wantStatus;
  else if (replyBody) newStatus = isAdmin ? 'answered' : 'open';

  if (newStatus !== ticket.status) {
    try {
      await fetch(`${REST_URL}/rest/v1/contact_tickets?id=eq.${ticketId}`, {
        method: 'PATCH',
        headers: { ...svc, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ status: newStatus })
      });
    } catch (e) { /* non-fatal */ }
  }

  return res.status(200).json({ ok: true, status: newStatus });
};
