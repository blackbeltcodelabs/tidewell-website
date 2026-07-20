# Message Center — Dashboard Integration Handover

Everything your dashboard needs to **read tickets** and **reply to customers as
Helpdesk**, on the Supabase `contact_tickets` + `ticket_messages` tables.

- **Host:** `https://srbwbhovjtpuxcfwsrcb.supabase.co`
- **Tables:** `public.contact_tickets` (ticket head) · `public.ticket_messages` (thread)
- **Auth (your dashboard backend):** Supabase **service-role key**
- **To reply as Helpdesk:** insert a `ticket_messages` row with `author = 'admin'`, then set `contact_tickets.status`

---

## 1. How the conversation flows

Every party reads and writes the **same two tables** — there is no separate
message store.

1. Customer submits `tidewellapp.com/contact` → one `contact_tickets` row
   (status `new`) **and** one `ticket_messages` row (`author='user'`, the
   opening message). Sending is gated by an 8-digit Supabase email OTP.
2. Customer follow-up on `/messages` → another `ticket_messages` row
   (`author='user'`); status → `open`.
3. **You reply from the dashboard** → a `ticket_messages` row (`author='admin'`)
   + status → `answered`. It appears in the customer's Message Center as
   **Helpdesk**.

The two tables are standalone — no foreign keys to `auth.users` or any app
table — but live in the same Supabase project.

## 2. Reply to a ticket as Helpdesk (the integration you build)

Your dashboard authenticates its own staff, then — with the **service-role key
on your backend** — does two writes against Supabase. No call to the website API
and no OTP is needed.

**Step 1 — post the reply.** The website renders any message with
`author = 'admin'` as **"Helpdesk"**:

```
POST https://srbwbhovjtpuxcfwsrcb.supabase.co/rest/v1/ticket_messages
apikey: <SERVICE_ROLE_KEY>
Authorization: Bearer <SERVICE_ROLE_KEY>
Content-Type: application/json
Prefer: return=representation

{
  "ticket_id":    "<the ticket's id>",
  "author":       "admin",
  "author_email": "support@blackbeltcodelabs.com",
  "body":         "Your reply to the customer…"
}
```

**Step 2 — advance the ticket status:**

```
PATCH https://srbwbhovjtpuxcfwsrcb.supabase.co/rest/v1/contact_tickets?id=eq.<ticket_id>
apikey: <SERVICE_ROLE_KEY>
Authorization: Bearer <SERVICE_ROLE_KEY>
Content-Type: application/json

{ "status": "answered" }
```

**Supabase JS (server-side only):**

```js
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
await supabase.from('ticket_messages').insert({
  ticket_id, author: 'admin', author_email: 'support@blackbeltcodelabs.com', body
});
await supabase.from('contact_tickets').update({ status: 'answered' }).eq('id', ticket_id);
```

**Raw SQL:**

```sql
insert into public.ticket_messages (ticket_id, author, author_email, body)
values ('<ticket_id>', 'admin', 'support@blackbeltcodelabs.com', 'Your reply text');
update public.contact_tickets set status = 'answered' where id = '<ticket_id>';
```

**Rules the write must satisfy:** `author` must be exactly `user` or `admin`
(DB check constraint) — use `admin` for Helpdesk; `ticket_id` must be an existing
`contact_tickets.id` (FK); `author_email` and `body` are NOT NULL. Keep the
service-role key server-side only.

> Alternative: the website's `POST /api/reply` does the same insert + status
> update, but it is **OTP-gated** (needs a Supabase auth session for an admin
> email) — right for the website UI, awkward for a backend. From the dashboard,
> write directly to the tables as above.

## 3. Schema (live, verified)

### `public.contact_tickets` — the ticket head

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `created_at` | timestamptz | NOT NULL | `now()` | Submission time (UTC) |
| `name` | text | null ok | — | Submitter's name |
| `email` | text | null ok | — | Submitter's email (lowercased, OTP-verified) |
| `department` | text | null ok | — | One of 5 department strings (see §6) |
| `priority` | text | null ok | — | `High` / `Medium` / `Low` (from department) |
| `turnaround_hours` | int | null ok | — | `24` / `36` / `48` (SLA from department) |
| `subject` | text | null ok | — | The customer's subject |
| `subject_line` | text | null ok | — | `[<Priority> Priority] [<Department>] <Subject>` |
| `message` | text | null ok | — | Opening message (also seeded into `ticket_messages`) |
| `status` | text | NOT NULL | `'new'` | Lifecycle — you own it after creation |

### `public.ticket_messages` — the thread

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `ticket_id` | uuid | NOT NULL | — | FK → `contact_tickets(id)`, `ON DELETE CASCADE` |
| `created_at` | timestamptz | NOT NULL | `now()` | Message time (UTC) |
| `author` | text | NOT NULL | — | Check: `'user'` or `'admin'`. `admin` renders as **Helpdesk**. |
| `author_email` | text | NOT NULL | — | Who wrote it |
| `body` | text | NOT NULL | — | Message text |

Both tables have **RLS enabled with no policies** → only the service-role key
reads/writes. Indexes: `contact_tickets(created_at desc)`,
`contact_tickets(status)`, `ticket_messages(ticket_id, created_at)`.

**Backfill for older tickets** (created before `ticket_messages` existed, so
their thread is empty — their opening text is only in `contact_tickets.message`):

```sql
insert into public.ticket_messages (ticket_id, author, author_email, body, created_at)
select ct.id, 'user', ct.email, ct.message, ct.created_at
from public.contact_tickets ct
left join public.ticket_messages tm on tm.ticket_id = ct.id
where tm.id is null and ct.message is not null;
```

## 4. The address

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

## 5. Reading the table

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

## 6. Field values your dashboard can rely on

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

## 7. Live updates (optional)

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

## 8. Security notes

- The table is **RLS-locked with no policies** — only the service-role key can
  read or write it. Keep that key on a server/backend; never ship it to a
  browser bundle.
- If your dashboard is browser-only (no backend), don't embed the service-role
  key. Instead add a narrow RLS **SELECT** policy scoped to your admin
  identity, and read with that authenticated session.
- The write path is already protected: `/api/contact` only inserts after the
  submitter's email passes Supabase OTP verification server-side.

## 9. What was built (in this repo)

| File | Role |
|---|---|
| `api/otp-send.js` | Sends the 8-digit email OTP (Supabase Auth) |
| `api/otp-verify.js` | Verifies the code, returns a short-lived token |
| `api/contact.js` | Re-checks the verified email, inserts the ticket row |
| `contact.html` | The public contact form + verification UI |

## 10. Prerequisites (already done: tables created, env vars set)

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
