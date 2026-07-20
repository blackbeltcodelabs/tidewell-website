// POST /api/thread  { access_token, email }
// Returns the verified email's tickets + message threads.
// Admins (ADMIN_EMAILS allowlist) get every ticket.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Valid email required.' });
  if (!accessToken) return res.status(401).json({ error: 'Please verify your email first.' });

  const SUPABASE_URL = baseUrl(process.env.SUPABASE_URL);
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const REST_URL = baseUrl(process.env.SUPABASE_REST_URL) || SUPABASE_URL;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Message center is not configured yet.' });
  }

  // 1) Confirm the OTP session matches the submitted email.
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

  // 2) Load tickets with nested messages (PostgREST embedding via the FK).
  const svc = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };
  let url = `${REST_URL}/rest/v1/contact_tickets`
    + `?select=*,ticket_messages(*)`
    + `&order=created_at.desc`
    + `&ticket_messages.order=created_at.asc`;
  if (isAdmin) url += '&limit=200';
  else url += `&email=ilike.${encodeURIComponent(verifiedEmail)}`;

  try {
    const r = await fetch(url, { headers: svc });
    if (!r.ok) return res.status(502).json({ error: 'Could not load your messages.' });
    const tickets = await r.json().catch(() => []);
    return res.status(200).json({ ok: true, admin: isAdmin, email: verifiedEmail, tickets });
  } catch (e) {
    return res.status(502).json({ error: 'Could not load your messages.' });
  }
};
