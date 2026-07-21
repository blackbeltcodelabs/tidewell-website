// POST /api/otp-send  { email }
// Triggers a Supabase email OTP (6-digit code) for verification.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Tolerate a pasted URL with a trailing slash or a /rest/v1 (or /auth/v1) suffix.
function baseUrl(u) {
  return String(u || '').trim().replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/, '');
}

function readJson(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = await readJson(req);
  // Honeypot: pretend success so bots don't learn anything.
  if (body.botcheck) return res.status(200).json({ ok: true });

  const email = String(body.email || '').trim();
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const SUPABASE_URL = baseUrl(process.env.SUPABASE_URL);
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'Email verification is not configured yet.' });
  }

  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      // Tag accounts created via the website contact/message flow so the admin
      // dashboard can tell them apart from real app users (and keep them out of
      // signup metrics). App users who verify here still count as app users —
      // the dashboard's is_app_user check (has app data) takes precedence.
      body: JSON.stringify({ email, create_user: true, data: { source: 'website_contact' } })
    });
    if (!r.ok) {
      // 429 = Supabase per-address send rate limit; surface a clear message.
      if (r.status === 429) {
        return res.status(429).json({ error: 'Please wait a moment before requesting another code.' });
      }
      return res.status(502).json({ error: 'Could not send a code right now. Please try again shortly.' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: 'Could not reach the verification service.' });
  }
};
