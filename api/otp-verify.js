// POST /api/otp-verify  { email, token }
// Verifies the 6-digit Supabase email OTP and returns a short-lived access token.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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
  const email = String(body.email || '').trim();
  const token = String(body.token || '').trim();

  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Valid email required.' });
  if (!/^\d{6}$/.test(token)) return res.status(400).json({ error: 'Enter the 6-digit code from your email.' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'Email verification is not configured yet.' });
  }

  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ type: 'email', email, token })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.access_token) {
      return res.status(400).json({ error: 'That code is invalid or has expired.' });
    }
    return res.status(200).json({ ok: true, access_token: data.access_token });
  } catch (e) {
    return res.status(502).json({ error: 'Could not verify the code right now.' });
  }
};
