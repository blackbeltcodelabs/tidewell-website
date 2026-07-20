// POST /api/contact
// { access_token, name, email, department, subject, message }
// Confirms the email was OTP-verified (Supabase), then stores the ticket
// in a Supabase table (no outbound email). Uses the service-role key
// server-side only, so the table can stay fully locked down by RLS.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Departments are connected to a priority + turnaround SLA here (server is the source of truth).
const DEPARTMENTS = {
  'Website Support':      { priority: 'Medium', hours: 36 },
  'Billing Issues':       { priority: 'High',   hours: 24 },
  'App Related Issues':   { priority: 'High',   hours: 24 },
  'Feedback or Concerns': { priority: 'Low',    hours: 48 },
  'Business':             { priority: 'Medium', hours: 36 }
};

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
  if (body.botcheck) return res.status(200).json({ ok: true }); // honeypot

  const accessToken = String(body.access_token || '');
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const department = String(body.department || '');
  const subject = String(body.subject || '').trim();
  const message = String(body.message || '').trim();

  if (!name || !EMAIL_RE.test(email) || !subject || !message) {
    return res.status(400).json({ error: 'Please complete all required fields.' });
  }
  const dept = DEPARTMENTS[department];
  if (!dept) return res.status(400).json({ error: 'Please choose a valid department.' });
  if (!accessToken) return res.status(401).json({ error: 'Please verify your email before sending.' });

  // Auth service (custom domain): https://auth.tidewellapp.com
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // REST (PostgREST) base — defaults to SUPABASE_URL. Set SUPABASE_REST_URL only if the
  // custom auth domain does not also serve /rest/v1 (then use the project https://xxxx.supabase.co URL).
  const REST_URL = process.env.SUPABASE_REST_URL || SUPABASE_URL;
  const TABLE = process.env.CONTACT_TABLE || 'contact_tickets';

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Messaging is not fully configured yet.' });
  }

  // 1) Confirm the submitted email is the one that just passed OTP verification.
  try {
    const ures = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` }
    });
    const user = await ures.json().catch(() => ({}));
    if (!ures.ok || !user.email || String(user.email).toLowerCase() !== email.toLowerCase()) {
      return res.status(401).json({ error: 'Email verification failed. Please verify again.' });
    }
  } catch (e) {
    return res.status(502).json({ error: 'Could not confirm verification.' });
  }

  // 2) Store the ticket. Subject line format kept for reference: [Priority] [Department] Subject.
  const priority = dept.priority;
  const subjectLine = `[${priority} Priority] [${department}] ${subject}`;

  try {
    const ins = await fetch(`${REST_URL}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        name,
        email,
        department,
        priority,
        turnaround_hours: dept.hours,
        subject,
        subject_line: subjectLine,
        message,
        status: 'new'
      })
    });
    if (!ins.ok) {
      return res.status(502).json({ error: 'Could not save your message right now. Please email support@blackbeltcodelabs.com.' });
    }
    return res.status(200).json({ ok: true, priority, hours: dept.hours });
  } catch (e) {
    return res.status(502).json({ error: 'Could not save your message right now.' });
  }
};
