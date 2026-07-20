// POST /api/contact
// { access_token, name, email, department, subject, message }
// Confirms the email was OTP-verified (Supabase), then sends the ticket via Resend.
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

function esc(s) {
  return String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
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

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const RESEND_FROM = process.env.RESEND_FROM || 'Tidewell <onboarding@resend.dev>';
  const CONTACT_TO = process.env.CONTACT_TO_EMAIL || 'support@blackbeltcodelabs.com';
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !RESEND_API_KEY) {
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

  // 2) Build the ticket. Subject line: [Priority] [Department] Subject.
  const priority = dept.priority;
  const subjectLine = `[${priority} Priority] [${department}] ${subject}`;

  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;color:#0D1E30;line-height:1.6">` +
    `<h2 style="margin:0 0 4px">New contact ticket</h2>` +
    `<p style="margin:0 0 16px;color:#55697D">Priority <strong>${esc(priority)}</strong> · target response within <strong>${dept.hours} hours</strong></p>` +
    `<table style="border-collapse:collapse;font-size:14px">` +
    `<tr><td style="padding:4px 16px 4px 0;color:#55697D">Priority</td><td style="padding:4px 0"><strong>${esc(priority)}</strong></td></tr>` +
    `<tr><td style="padding:4px 16px 4px 0;color:#55697D">Department</td><td style="padding:4px 0">${esc(department)}</td></tr>` +
    `<tr><td style="padding:4px 16px 4px 0;color:#55697D">Turnaround</td><td style="padding:4px 0">Within ${dept.hours} hours</td></tr>` +
    `<tr><td style="padding:4px 16px 4px 0;color:#55697D">Name</td><td style="padding:4px 0">${esc(name)}</td></tr>` +
    `<tr><td style="padding:4px 16px 4px 0;color:#55697D">Email</td><td style="padding:4px 0">${esc(email)} (verified)</td></tr>` +
    `<tr><td style="padding:4px 16px 4px 0;color:#55697D">Subject</td><td style="padding:4px 0">${esc(subject)}</td></tr>` +
    `</table>` +
    `<h3 style="margin:20px 0 6px">Message</h3>` +
    `<p style="white-space:pre-wrap;margin:0">${esc(message)}</p>` +
    `</div>`;

  const text =
    `New contact ticket\n` +
    `Priority: ${priority} (target response within ${dept.hours} hours)\n` +
    `Department: ${department}\n` +
    `Name: ${name}\n` +
    `Email: ${email} (verified)\n` +
    `Subject: ${subject}\n\n` +
    `${message}\n`;

  // 3) Send via Resend.
  try {
    const rr = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [CONTACT_TO],
        reply_to: email,
        subject: subjectLine,
        html,
        text
      })
    });
    if (!rr.ok) {
      return res.status(502).json({ error: 'Could not send your message right now. Please email support directly.' });
    }
    return res.status(200).json({ ok: true, priority, hours: dept.hours });
  } catch (e) {
    return res.status(502).json({ error: 'Could not send your message right now.' });
  }
};
