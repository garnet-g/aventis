# VybeCrew

A phone-first web app where customers in Kenya put a design or a name on a T-shirt or hoodie, inside a fixed print area, pass a safety check, and pay. The owners get a paid order with two files to give to their printer:

- the **mockup** (the garment with the design on it), and
- the **design file** (the artwork alone, a transparent PNG at print resolution).

Design spec: `docs/design/design-spec.md`
Build plan: `docs/design/implementation-plan.md`

## How an order flows

1. The customer opens `/design`, picks item, color and size, uploads an image and/or adds a name. Art can only sit inside the dashed print area.
2. **Add to cart** saves the design and runs the safety check:
   - clearly fine: it goes into the cart (`/cart`)
   - unsure: payment is blocked, the customer sees "Waiting for review" (see `/orders`)
   - clearly explicit: rejected with a reason
3. An admin reviews "unsure" designs at `/admin/review`. Approving emails the customer a payment link; rejecting emails the reason.
4. The customer pays. The cart holds several designs, each with a quantity of 1 to 50. One payment covers the whole cart: the server computes the amount (prices x quantities, plus one delivery fee) from `lib/catalog.ts` and `lib/pricing.ts`, records one paid order per design, and renders the mockup and design file from a **snapshot** of the design.
5. Admins see the order at `/admin/orders`, download both files (60-second signed links), hand them to the printer, and move the order through **Paid → At printer → Shipped → Delivered**. The customer is emailed when an order ships and when it is delivered.

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
| Selling prices (KES 1,500 tee / 2,200 hoodie) and the delivery fee (KES 250) | `lib/catalog.ts` |
| Print-area size in cm (tee 28×32, hoodie 25×28) and the minimum print resolution (150 DPI) | `lib/catalog.ts`. **Confirm with your printer**, along with file format and whether black garments need a white underlayer |
| How the print area lines up on the garment photos (`PX_PER_CM`, collar position) | `lib/editorGeometry.ts` |
| Garment photos (simple drawn placeholders now) | `public/garments/` (800×1000 PNG per product and color) |
| The banned-word list | `lib/moderation/banned-words.json` |

Your known print costs (hoodie KES 1,300, tee KES 800) are already in `lib/catalog.ts`; the admin order page shows profit as *price + delivery − cost*.

## Safety checks: what they do and don't catch

- **Text** is matched against a word list in English, Swahili, Roman Urdu and Urdu script, after removing invisible characters and accents and mapping look-alike letters. Words that are also names (for example "Dick") go to human review instead of being rejected. It does **not** catch masked spellings such as `f*ck` or slang that is not on the list. Add words as real cases appear.
- **Images** are scored by OpenAI's moderation model (`OPENAI_API_KEY`). Unsure scores go to human review; a failed check always goes to human review, never straight to payment.
- Anything unusual (mixed alphabets inside one word, odd Latin letters) is sent to human review.

Treat the text filter as a first line, not a guarantee. Review the queue regularly.

## Adding a real payment provider

For Kenya the natural choice is M-Pesa (Safaricom Daraja STK push, or an aggregator such as Pesapal or Flutterwave that also takes cards). Amounts are whole Kenya shillings (KES); phone numbers are Kenyan mobiles (07xx, 01xx or +254) and delivery addresses use the 47 counties.

Implement `PaymentProvider` in `lib/payments/` (see `lib/payments/index.ts`) and add it to `getPaymentProvider()`. The provider **must** treat `reference` (a fingerprint of the cart) as an idempotency key, so a retry or a double click can never charge a customer twice. The same cart can only ever be paid once. Until a real provider is added, checkout shows a **TEST MODE** banner and no money moves.

## Known limits and recommendations

- **Hosting body limit:** serverless hosts such as Vercel cap request bodies (around 4.5 MB), below the app's 10 MB upload limit. Before deploying there, switch uploads to direct-to-storage signed URLs or lower the limit.
- **Rendering runs inside the web server.** During testing, one full test run had a native crash (heap corruption) in the image library that I could not reproduce again in 13 further runs or 1,400 stress renders. Before real traffic, move mockup/design-file rendering into a separate worker process so a crash cannot take down the website, and queue it for bursts of orders.
- Emails are English only; the app UI is English only (Arabic-script text on garments is supported).
- If a customer edits a design in the few moments between paying and the order being recorded, the order is refused and that payment has to be refunded by hand (no unchecked art can reach the printer: the database re-checks approval when the order is written).
- One design per order (several pieces of it via quantity); no guest checkout; a single admin role; no refunds screen.
- Local development uses a permissive stand-in for the image-safety check when no key is set; do not run that way in production.

## Project map

```
app/                customer pages (design, checkout, orders), admin pages, API routes
components/         Editor (Fabric canvas), DesignWorkbench, DesignFlow, checkout and admin widgets
lib/                catalog, moderation, designs, orders, payments, artifacts (rendering), admin logic
supabase/migrations database schema, access rules, private storage buckets
assets/fonts        bundled fonts (OFL) used to print Latin and Arabic-script text on the server
tests/              vitest unit/database tests; tests/e2e for Playwright
```

## Images customers upload

- Accepted: PNG, JPG and WebP, up to 10 MB and 40 megapixels. At least 300 px on the shorter side.
- Anything smaller than the print area is **allowed**; instead the editor shows a live **Print quality** rating (Great, OK or Low, based on pixels per inch at the size the customer placed it) and warns when it may print blurry.
- Uploads are stored upright (phone-photo rotation applied), converted from WebP to PNG, and capped at 3600 px on the longest side.
- Tools on a selected image: flip left-right, flip top-bottom, rotate 90°. Flips and rotation are saved and applied in the printed file.

## Text and layers

- A name or text can be restyled after it is added: edit the words, pick a font, a color from the palette, and a size. Five fonts are offered (four Latin, one Arabic); Arabic-script text switches to the Arabic font automatically. Each font has a web version for the editor and a print file in `assets/fonts` (all open-license), so the printed file matches the screen.
- Text in the default ink follows the garment color (dark on white, light on black); a color the customer picked is kept.
- Undo and redo cover every change, images included. Duplicate, Bring to front and Send to back change the stacking order; the printed file uses the same order.

## Printing on the back, and saving for later

- **Front and back.** The design page has Front and Back tabs. Each side has its own artwork, its own undo history, and its own garment photo and print area. Printing the back adds a fixed extra to the price and to your cost, set in `lib/catalog.ts` (`BACK_PRINT_PRICE_KES` KES 500, `BACK_PRINT_COST_KES` KES 400): **placeholders, confirm with your printer**, as are the back print-area sizes (`backPrintArea`) and the garment back photos in `public/garments/*-back-*.png`.
- **One check covers both sides.** Safety review, approval and payment all apply to front and back together; changing either side sends an approved design back to draft.
- **Orders keep both sides.** The admin order page then offers four downloads (front and back mockup, front and back design file).
- **Saved as you go.** A design is saved automatically about a second after each change, once it has anything on it, and also when the page is hidden. **Save for later** saves and goes to My prints, where a draft has a **Continue designing** link that reopens it with its pictures and text. A design that is waiting for review, or already ordered, cannot be reopened for editing.
- **Existing databases:** apply the new migration with `npx supabase migration up` (it adds `back_layers` and the back columns on orders).

## Cart, quantity and shipping emails

- **Existing databases:** apply the new migration with `npx supabase migration up` (adds `cart_items`, `checkouts`, and `quantity` on orders).
- The delivery fee is charged once per payment and recorded on the first order. An order's price and printer cost cover all its pieces.
- A design edited after it went in the cart must be checked again before it can be paid for.

## Admin tools

- **Existing databases:** apply `npx supabase migration up` (adds `order_notes` and `settings`; both are server-only, customers cannot read them).
- **Orders** (`/admin/orders`): search by name, phone, city, order id, item or note, and filter by status.
- **Private note** on each order page; customers never see it.
- **Alerts:** the admin menu shows how many designs wait for review and how many paid orders are new, and every new paid checkout emails the admins. Set `ADMIN_ALERT_EMAILS` (comma separated) to choose who; otherwise every admin account is emailed.
- **Prices** (`/admin/settings`): customer price and printer cost for each item, the back-print extra, and the delivery fee. They apply to new carts and checkouts; paid orders keep the price they were paid at. The numbers in `lib/catalog.ts` are only the starting values.

## Crop and background removal

- **Crop:** select a picture, press Crop, drag the corners or the middle of the box (Free or Square), press Crop. The cut-out is uploaded as a new picture and takes the old one's place at the same scale; a box under 300 px on the shorter side is refused. One undo step brings the original back.
- **Remove background:** runs inside the customer's browser, so photos never go to a third party. It uses the Apache-2.0 `Xenova/modnet` model (about 7 MB; `BACKGROUND_MODEL` in `lib/imageEdit.ts`) through `@huggingface/transformers`. The first use downloads the model from huggingface.co and the ONNX runtime from cdn.jsdelivr.net, then the browser keeps them.
- **Know the limit:** MODNet is trained on **people**. It cuts out portraits well and logos or objects poorly. If customers mostly upload artwork, swap in a general model (`onnx-community/BiRefNet_lite-ONNX` is MIT but about 115 MB; RMBG models need a commercial licence from Bria) or an outside service.
- Edited pictures are new uploads, so the safety check runs on them like any other picture.

## VybeCrew brand, layout and catalogue

- **Brand:** the shop is called VybeCrew. Colours are black, yellow (`#ffd60a`) and white; they are defined once in `app/globals.css`. Errors keep a red so they stand out. The logo is in `public/brand/` (`vybecrew-mark.svg` tile, `vybecrew-logo.svg` tile and name, with PNG copies) and the browser icon is `app/icon.svg`. The in-page logo is the `Logo` component in `components/SiteHeader.tsx`.
- **Layout:** every page uses the `.shell` width (full width on phones, wide with generous margins on computers). The design page puts the editor beside its controls on large screens; the cart and checkout use two columns.
- **Catalogue** (`/catalogue`): ready-made designs. Admins post them at `/admin/catalogue` (title, T-shirt or hoodie, colours, a front and/or back picture; the picture is centred in the print area as large as it fits and a preview is rendered for each colour). New designs start hidden until published; hiding or deleting removes them from the shop but never affects orders already placed.
- **Ordering from the catalogue:** a customer picks colour, size and quantity and adds it to the cart, or opens it in the editor with "Customise this design". Each order copies the pictures into the customer's own folder, so the printer files are produced the same way as for any design. Catalogue art is treated as trusted (an admin posted it), so it skips the customer safety check; look at what you post.
- **Existing databases:** apply `npx supabase migration up` (adds `catalogue_items` and a public `catalogue` storage bucket). Selling prices come from the Prices page, the same as custom designs.

## Kenya

The shop is set up for Nairobi: amounts are in Kenya shillings (KES), delivery addresses use the 47 counties, and phone numbers must be Kenyan mobiles (`0712345678`, `0112345678`, `+254712345678`). Migration `0008_kenya.sql` renames the database columns (`*_pkr` to `*_kes`, `province` to `county`) and the saved price keys; it does not convert amounts. The starting prices in `lib/catalog.ts` are the same numbers as before, now read as shillings, so set your real selling prices, print costs and delivery fee on the Prices page. The Urdu Nastaliq font has been removed; one Arabic-script font stays so that Arabic text still prints correctly.

## Bulk prices

Customers pay less per piece when they order more of the same design. The owner sets up to five bulk prices on the admin Prices page ("Order 10 or more and save 10%"); the biggest one a line reaches applies to every piece on that line, garment and back print alike. The starting set is 5+ save 5%, 10+ save 10%, 25+ save 15%. Bulk prices lower what the customer pays but not what the printer charges, so profit on those orders is smaller. The paid order keeps the discounted price. Customers see the offer on the home page and the catalogue design page, and a "Bulk price" badge on the cart line once it applies.

The header shows an Admin link to signed-in admins.
