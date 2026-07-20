# Contact form backend — setup

The `/contact` form uses three Vercel serverless functions (no npm deps —
they call the Supabase REST APIs with `fetch`):

- `api/otp-send.js` — sends an 8-digit email OTP via Supabase Auth
- `api/otp-verify.js` — verifies the code, returns a short-lived access token
- `api/contact.js` — re-checks the verified email server-side, then stores the
  ticket in a Supabase table (no outbound email)

## Required environment variables (Vercel → Project → Settings → Environment Variables)

| Variable | Purpose | Example |
|---|---|---|
| `SUPABASE_URL` | Auth base URL — your **custom auth domain** | `https://auth.tidewellapp.com` |
| `SUPABASE_ANON_KEY` | Anon/public key (used for OTP send/verify + token check) | `eyJhbGci...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (server-side only; used to insert the ticket) | `eyJhbGci...` |
| `SUPABASE_REST_URL` | *Optional.* Only set if the custom auth domain does **not** serve `/rest/v1`; then use the project URL | `https://xxxx.supabase.co` |
| `CONTACT_TABLE` | *Optional.* Table name (defaults to `contact_tickets`) | `contact_tickets` |

> The service-role key is a powerful secret. It lives only in the Vercel
> function environment and is never sent to the browser.

## Supabase: create the tickets table

A dedicated, standalone table — no foreign keys to `auth.users` or any app
table. Isolated from the app's user data, same project. Run this once in the
Supabase SQL editor:

```sql
create table if not exists public.contact_tickets (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  name             text not null,
  email            text not null,
  department       text not null,
  priority         text not null,
  turnaround_hours int  not null,
  subject          text not null,
  subject_line     text not null,
  message          text not null,
  status           text not null default 'new'
);

create index if not exists contact_tickets_created_at_idx on public.contact_tickets (created_at desc);
create index if not exists contact_tickets_status_idx     on public.contact_tickets (status);

-- Lock the table down: only the service-role key (used by the Vercel function
-- and your admin dashboard's backend) can read or write. No public/anon access.
alter table public.contact_tickets enable row level security;
```

## Supabase: emit a numeric email OTP

Supabase's default email template sends a **magic link**, not a code. To send a
8-digit code:

1. Supabase dashboard → **Authentication → Email Templates → Magic Link**.
2. Add `{{ .Token }}` to the template body (renders the 8-digit code).
3. **Authentication → Providers → Email**: make sure email OTP is enabled.

## Department → priority → turnaround mapping

The server (`api/contact.js`) is the source of truth; the client mirrors it for display:

| Department | Priority | Turnaround |
|---|---|---|
| Billing Issues | High | 24 hours |
| App Related Issues | High | 24 hours |
| Website Support | Medium | 36 hours |
| Business | Medium | 36 hours |
| Feedback or Concerns | Low | 48 hours |

Stored subject line format: `[<Priority> Priority] [<Department>] <Subject>`.

## Reading the table from your dashboard

The table is exposed through Supabase's auto-generated REST API (PostgREST).

**Base address**

```
https://<REST-HOST>/rest/v1/contact_tickets
```

`<REST-HOST>` is `auth.tidewellapp.com` if the custom domain also serves REST,
otherwise the project URL host `xxxx.supabase.co`. Confirm with:

```
curl -s -o /dev/null -w "%{http_code}\n" https://auth.tidewellapp.com/rest/v1/
# 401 -> REST is served here (use auth.tidewellapp.com)
# 404 -> use https://xxxx.supabase.co instead
```

**Auth** — the table is RLS-locked, so read it with the **service-role key**
from a trusted backend (never ship that key to a browser). Send it as both the
`apikey` header and a bearer token.

**List every ticket, newest first**

```
curl "https://<REST-HOST>/rest/v1/contact_tickets?select=*&order=created_at.desc" \
  -H "apikey: <SERVICE_ROLE_KEY>" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
```

**Supabase JS client**

```js
import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://<REST-HOST>', '<SERVICE_ROLE_KEY>');

const { data, error } = await supabase
  .from('contact_tickets')
  .select('*')
  .order('created_at', { ascending: false });
```

**Common filters** (PostgREST query params)

- New only: `?status=eq.new`
- High priority: `?priority=eq.High`
- One department: `?department=eq.Billing%20Issues`
- Paginate: `?limit=50&offset=0` (or a `Range: 0-49` header)

**Columns returned:** `id, created_at, name, email, department, priority,
turnaround_hours, subject, subject_line, message, status`.

To be alerted on new rows, add a **Database Webhook** (Supabase → Database →
Webhooks) to Slack/email — optional, can be wired later.
