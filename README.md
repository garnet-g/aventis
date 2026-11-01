# Printly

A phone-first web app where customers in Pakistan put a design or a name on a T-shirt or hoodie, inside a fixed print area, pass a safety check, and pay. The owners get a paid order with two files to give to their printer:

- the **mockup** (the garment with the design on it), and
- the **design file** (the artwork alone, a transparent PNG at print resolution).

Design spec: `docs/superpowers/specs/2026-10-31-custom-apparel-platform-design.md`
Build plan: `docs/superpowers/plans/2026-10-31-custom-apparel-platform.md`

## How an order flows

1. The customer opens `/design`, picks item, color and size, uploads an image and/or adds a name. Art can only sit inside the dashed print area.
2. **Continue to checkout** saves the design and runs the safety check:
   - clearly fine: straight to `/checkout/<design>`
   - unsure: payment is blocked, the customer sees "Waiting for review" (see `/orders`)
   - clearly explicit: rejected with a reason
3. An admin reviews "unsure" designs at `/admin/review`. Approving emails the customer a payment link; rejecting emails the reason.
4. The customer pays. The server computes the amount (item price + delivery fee) from `lib/catalog.ts`, records one paid order, and renders the mockup and design file from a **snapshot** of the design.
5. Admins see the order at `/admin/orders`, download both files (60-second signed links), hand them to the printer, and move the order through **Paid → At printer → Shipped → Delivered**.

## Run it locally

You need Node 20+, Docker Desktop (for the local Supabase stack) and the Supabase CLI (`npx supabase`).

```bash
npm install
npx supabase start          # prints the local URL, anon key and service_role key
cp .env.local.example .env.local   # then paste the keys in
npm run dev
```

Environment variables (`.env.local`):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase connection |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key; never expose it to the browser |
| `PAYMENT_PROVIDER` | `dummy` (default). The only provider in v1 |
| `OPENAI_API_KEY` | Enables the image-safety check (see below). Without it, local dev treats every image as safe and production sends every image to human review |
| `RESEND_API_KEY`, `EMAIL_FROM` | Real email. Without them emails are printed to the server console |
| `NEXT_PUBLIC_SITE_URL` | Used in the links inside emails (default `http://localhost:3000`) |

### Make someone an admin

Admins are set directly in the database. After the person has signed up, run in the Supabase SQL editor:

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'owner@example.com');
```

Non-admins get a 404 on every `/admin` page and API.

## Tests

```bash
npx vitest run          # unit and database tests (no Docker needed)
npx playwright test     # browser tests (starts its own dev server on port 3100)
# If `npm run dev` is already running (Next.js allows one per project), test against it instead:
#   E2E_BASE_URL=http://localhost:3000 npx playwright test
# The full-flow tests need the local database: `npx supabase start`
```

The database rules (row-level security, the freeze-after-order trigger, the order-matches-design trigger) are tested against a real in-process Postgres (PGlite) using the actual migration.

## Things you must fill in before real customers

These are **placeholders** I could not know. Each lives in one place:

| What | Where |
|---|---|
| Selling prices (PKR 1,500 tee / 2,200 hoodie) and the delivery fee (PKR 250) | `lib/catalog.ts` |
| Print-area size in cm (tee 28×32, hoodie 25×28) and the minimum print resolution (150 DPI) | `lib/catalog.ts`. **Confirm with your printer**, along with file format and whether black garments need a white underlayer |
| How the print area lines up on the garment photos (`PX_PER_CM`, collar position) | `lib/editorGeometry.ts` |
| Garment photos (simple drawn placeholders now) | `public/garments/` (800×1000 PNG per product and color) |
| The banned-word list | `lib/moderation/banned-words.json` |

Your known print costs (hoodie PKR 1,300, tee PKR 800) are already in `lib/catalog.ts`; the admin order page shows profit as *price + delivery − cost*.

## Safety checks: what they do and don't catch

- **Text** is matched against a word list in English, Roman Urdu and Urdu script, after removing invisible characters and accents and mapping look-alike letters. Words that are also names (for example "Dick") go to human review instead of being rejected. It does **not** catch masked spellings such as `f*ck` or slang that is not on the list. Add words as real cases appear.
- **Images** are scored by OpenAI's moderation model (`OPENAI_API_KEY`). Unsure scores go to human review; a failed check always goes to human review, never straight to payment.
- Anything unusual (mixed alphabets inside one word, odd Latin letters) is sent to human review.

Treat the text filter as a first line, not a guarantee. Review the queue regularly.

## Adding a real payment provider

Implement `PaymentProvider` in `lib/payments/` (see `lib/payments/index.ts`) and add it to `getPaymentProvider()`. The provider **must** treat `reference` (the design id) as an idempotency key, so a retry or a double click can never charge a customer twice. The database already guarantees one order per design. Until a real provider is added, checkout shows a **TEST MODE** banner and no money moves.

## Known limits and recommendations

- **Hosting body limit:** serverless hosts such as Vercel cap request bodies (around 4.5 MB), below the app's 10 MB upload limit. Before deploying there, switch uploads to direct-to-storage signed URLs or lower the limit.
- **Rendering runs inside the web server.** During testing, one full test run had a native crash (heap corruption) in the image library that I could not reproduce again in 13 further runs or 1,400 stress renders. Before real traffic, move mockup/design-file rendering into a separate worker process so a crash cannot take down the website, and queue it for bursts of orders.
- Emails are English only; the app UI is English only (Urdu names on garments are supported).
- One item per order; no guest checkout; a single admin role; no refunds screen.
- Local development uses a permissive stand-in for the image-safety check when no key is set; do not run that way in production.

## Project map

```
app/                customer pages (design, checkout, orders), admin pages, API routes
components/         Editor (Fabric canvas), DesignWorkbench, DesignFlow, checkout and admin widgets
lib/                catalog, moderation, designs, orders, payments, artifacts (rendering), admin logic
supabase/migrations database schema, access rules, private storage buckets
assets/fonts        bundled fonts (OFL) used to print Urdu and Latin text on the server
tests/              vitest unit/database tests; tests/e2e for Playwright
```
