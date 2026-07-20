# Contact form backend — setup

The `/contact` form uses three Vercel serverless functions (no npm deps —
they call the Supabase and Resend REST APIs with `fetch`):

- `api/otp-send.js` — sends a 6-digit email OTP via Supabase Auth
- `api/otp-verify.js` — verifies the code, returns a short-lived access token
- `api/contact.js` — re-checks the verified email server-side, then sends the
  ticket via Resend

## Required environment variables (set in Vercel → Project → Settings → Environment Variables)

| Variable | Purpose | Example |
|---|---|---|
| `SUPABASE_URL` | Supabase project URL | `https://xxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anon/public key (used for OTP send/verify + token check) | `eyJhbGci...` |
| `RESEND_API_KEY` | Resend API key | `re_...` |
| `RESEND_FROM` | Verified Resend sender | `Tidewell <noreply@tidewellapp.com>` |
| `CONTACT_TO_EMAIL` | Where tickets are delivered (optional; defaults to support@blackbeltcodelabs.com) | `support@blackbeltcodelabs.com` |

## Supabase: enable a numeric email OTP

Supabase's default email template sends a **magic link**, not a code. To send a
6-digit code, edit the template so it includes the token:

1. Supabase dashboard → **Authentication → Email Templates → Magic Link**.
2. Add `{{ .Token }}` to the template body (this renders the 6-digit code).
3. Authentication → **Providers → Email**: make sure email OTP is enabled.

(OTP length defaults to 6 and expiry to ~1 hour — both fine.)

## Resend

1. Create a Resend account and **verify the sending domain** (e.g. `tidewellapp.com`).
2. Create an API key → set it as `RESEND_API_KEY`.
3. Set `RESEND_FROM` to an address on the verified domain.

## Department → priority → turnaround mapping

The server (`api/contact.js`) is the source of truth; the client mirrors it for display:

| Department | Priority | Turnaround |
|---|---|---|
| Billing Issues | High | 24 hours |
| App Related Issues | High | 24 hours |
| Website Support | Medium | 36 hours |
| Business | Medium | 36 hours |
| Feedback or Concerns | Low | 48 hours |

Ticket subject line is built as: `[<Priority> Priority] [<Department>] <Subject>`.
