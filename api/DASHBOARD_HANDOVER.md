# Contact Tickets — Dashboard Integration Handover

Everything your dashboard needs to read contact-form submissions from Supabase.

---

## 1. What this is

The `tidewellapp.com/contact` form does this on submit:

1. Visitor fills the form (name, email, department, subject, message).
2. Visitor verifies their email with an 8-digit Supabase OTP code.
3. A Vercel serverless function (`/api/contact`) re-checks the verified email
   server-side, then **inserts one row** into a dedicated Supabase table.
4. **Your dashboard reads that table.**

The table is standalone — no foreign keys to `auth.users` or any app table,
fully isolated from the app's user data, but in the same Supabase project.

## 2. The data source

- **Table:** `public.contact_tickets`
- **One row per submission.**
- **Access:** Row Level Security is ON with no public policies, so the table is
  private. Read it with the **service-role key** from a trusted backend.

### Schema

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | Primary key |
| `created_at` | timestamptz | no | `now()` | Submission time (UTC) |
| `name` | text | no | — | Submitter's name |
| `email` | text | no | — | Submitter's email (already OTP-verified) |
| `department` | text | no | — | One of 5 department strings (see §5) |
| `priority` | text | no | — | `High` / `Medium` / `Low` (derived from department) |
| `turnaround_hours` | int | no | — | `24` / `36` / `48` (SLA derived from department) |
| `subject` | text | no | — | The visitor's subject text |
| `subject_line` | text | no | — | Composed: `[<Priority> Priority] [<Department>] <Subject>` |
| `message` | text | no | — | The visitor's message body |
| `status` | text | no | `'new'` | Ticket status; starts at `new` |

## 3. The address

The table is exposed through Supabase's auto-generated REST API (PostgREST).

```
https://<REST-HOST>/rest/v1/contact_tickets
```

`<REST-HOST>` is **`auth.tidewellapp.com`** if that custom domain also serves
REST, otherwise the project host `xxxx.supabase.co`. Confirm once:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://auth.tidewellapp.com/rest/v1/
# 401 -> use auth.tidewellapp.com
# 404 -> use https://xxxx.supabase.co
```

### Auth

Send the **service-role key** as both headers (never expose it in a browser):

```
apikey: <SERVICE_ROLE_KEY>
Authorization: Bearer <SERVICE_ROLE_KEY>
```

## 4. Reading the table

**List every ticket, newest first**

```bash
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

**Filters & paging** (PostgREST query params)

| Goal | Query |
|---|---|
| New only | `?status=eq.new` |
| High priority | `?priority=eq.High` |
| One department | `?department=eq.Billing%20Issues` |
| Since a date | `?created_at=gte.2026-07-01` |
| Newest first | `?order=created_at.desc` |
| Page of 50 | `?limit=50&offset=0` |
| Total count | add header `Prefer: count=exact` → read `Content-Range: 0-49/213` |
| One ticket | `?id=eq.<uuid>` (add header `Accept: application/vnd.pgrst.object+json` for a single object) |

**Example response**

```json
[
  {
    "id": "8f2c1e5a-4b7d-42a1-9c3e-1d5f6a7b8c90",
    "created_at": "2026-07-20T18:42:11.123Z",
    "name": "Priya K.",
    "email": "priya@example.com",
    "department": "Billing Issues",
    "priority": "High",
    "turnaround_hours": 24,
    "subject": "Can't cancel my annual plan",
    "subject_line": "[High Priority] [Billing Issues] Can't cancel my annual plan",
    "message": "Hi, I tried to cancel from the App Store but ...",
    "status": "new"
  }
]
```

## 5. Field values your dashboard can rely on

**Department → priority → turnaround** (the server derives priority + SLA from
the department, so these are always consistent):

| `department` | `priority` | `turnaround_hours` |
|---|---|---|
| `Billing Issues` | `High` | `24` |
| `App Related Issues` | `High` | `24` |
| `Website Support` | `Medium` | `36` |
| `Business` | `Medium` | `36` |
| `Feedback or Concerns` | `Low` | `48` |

- **`priority`** is always exactly `High`, `Medium`, or `Low` (capitalised).
- **`status`** is written as `new` on insert. Your dashboard owns the lifecycle
  after that — e.g. `new → open → resolved → closed`. Nothing else writes to
  these rows, so you can update `status` freely.

## 6. Live updates (optional)

To push new tickets into the dashboard without polling, use Supabase Realtime:

```js
supabase
  .channel('contact_tickets')
  .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'contact_tickets' },
      (payload) => { /* payload.new is the ticket row */ })
  .subscribe();
```

Enable Realtime for the table once:

```sql
alter publication supabase_realtime add table public.contact_tickets;
```

## 7. Security notes

- The table is **RLS-locked with no policies** — only the service-role key can
  read or write it. Keep that key on a server/backend; never ship it to a
  browser bundle.
- If your dashboard is browser-only (no backend), don't embed the service-role
  key. Instead add a narrow RLS **SELECT** policy scoped to your admin
  identity, and read with that authenticated session.
- The write path is already protected: `/api/contact` only inserts after the
  submitter's email passes Supabase OTP verification server-side.

## 8. What was built (in this repo)

| File | Role |
|---|---|
| `api/otp-send.js` | Sends the 8-digit email OTP (Supabase Auth) |
| `api/otp-verify.js` | Verifies the code, returns a short-lived token |
| `api/contact.js` | Re-checks the verified email, inserts the ticket row |
| `contact.html` | The public contact form + verification UI |

## 9. Prerequisites (must be done before rows appear)

1. **Create the table** — run in Supabase SQL editor:

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
   alter table public.contact_tickets enable row level security;
   ```

2. **Enable the code email** — Supabase → Auth → Email Templates → *Magic Link*
   → add `{{ .Token }}` to the body.

3. **Vercel env vars** → `SUPABASE_URL=https://auth.tidewellapp.com`,
   `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` → redeploy.
