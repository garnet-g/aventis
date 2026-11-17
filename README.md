# VybeCrew

A phone-first print-on-demand shop for Kenya. Customers design their own T-shirt or hoodie (pictures and text inside a fixed print area, front and back) or order a ready-made design from the catalogue, pass a safety check, and pay with M-Pesa. The owners get a paid order with the files for their printer:

- the **mockup** (the garment with the design on it), and
- the **design file** (the artwork alone, a transparent PNG at print resolution), for each printed side.

The design notes in `docs/design/` describe the first version and are kept for history; this README is current.

## How an order flows

1. The customer opens `/design`, picks item, colour and size, uploads pictures and adds text. Art can only sit inside the print area (T-shirt front 27 x 32 cm, back 28 x 32 cm; hoodie front and back 25 x 28 cm). Big phone photos are shrunk in the browser first (4000 px, still over 300 dpi at full size), so uploads use little data.
2. **Add to cart** saves the design and runs the safety check:
   - clearly fine: it goes into the cart (`/cart`)
   - unsure: payment is blocked, the customer sees "Waiting for review" (on `/orders`)
   - clearly explicit: rejected with a reason
3. An admin reviews "unsure" designs at `/admin/review`, which shows why each one is there. Approving emails the customer; rejecting emails the reason.
4. Checkout (`/checkout`): delivery details (pre-filled from the last order), the M-Pesa number and acceptance of the terms. The server works out the amount (prices x quantities, bulk discount over every piece in the cart, one delivery fee by county) and sends an M-Pesa prompt to the phone. The page waits ("Check your phone") and moves to the thank-you page once Safaricom confirms. One paid order is recorded per design, and the printer files are drawn from a **snapshot** of the design.
5. The customer gets an email receipt and an SMS. Admins get an alert, see the order at `/admin/orders`, download the files, and move it through **Paid → At printer → Shipped (courier and tracking number) → Delivered**. The customer gets an email and an SMS when it ships and when it is delivered.

## Run it locally

You need Node 22, Docker Desktop (for the local Supabase stack) and the Supabase CLI (`npx supabase`).

```bash
npm install
npx supabase start                  # prints the local URL, anon key and service_role key
cp .env.local.example .env.local    # then paste the keys in
npm run dev
node --env-file=.env.local scripts/create-demo-accounts.mjs   # local test logins (local database only)
```

Every setting is described in `.env.local.example`. Without the optional ones the app still runs: payments are in test mode, emails and SMS are printed to the server log, and the picture check passes everything (development only).

After pulling new code, apply new database changes with `npx supabase migration up`.

## Taking M-Pesa payments

Payments use Safaricom's Daraja API (STK push: the customer gets a prompt on their phone and enters their M-Pesa PIN).

1. Create an app on https://developer.safaricom.co.ke and copy the consumer key and secret. The sandbox gives a test shortcode and passkey.
2. Set `PAYMENT_PROVIDER=mpesa`, `MPESA_ENV=sandbox` and the `MPESA_*` values (see `.env.local.example`). Paybill: `MPESA_TRANSACTION_TYPE=paybill`. Till (Buy Goods): `till`, plus `MPESA_TILL_NUMBER`.
3. Set `MPESA_CALLBACK_SECRET` to a long random string. Safaricom reports each payment to `https://<your site>/api/payments/mpesa/<secret>`; the app also asks Safaricom directly before trusting a report, so a forged callback cannot mark an order paid.
4. For real money, complete Safaricom's Go Live for your paybill or till, then switch to `MPESA_ENV=production` with the production keys. `NEXT_PUBLIC_SITE_URL` must be your public https address.

How it behaves:

- A prompt nobody answers expires after about four minutes; the customer can try again. Prompts are limited per account and per phone number, so nobody can flood a stranger's phone.
- If money arrives but the order cannot be made (for example the design changed at that moment), the payment is marked **Refund needed**, the admins are emailed, and it appears on `/admin/payments`. Send the money back through M-Pesa, then record the refund reference there.
- With `PAYMENT_PROVIDER=dummy` checkout shows a TEST MODE banner and every payment succeeds at once.

## SMS (Celcom Africa)

Set `CELCOM_API_KEY`, `CELCOM_PARTNER_ID` and `CELCOM_SHORTCODE` (your approved sender name). Customers then get an SMS when they pay, when their order ships (with the tracking number) or is delivered, and if an order is cancelled. A failed SMS is logged and never blocks the order. Without the settings, messages are printed to the server log.

## Hosting in Kenya

The app runs anywhere Docker runs, so it can be hosted on a Kenyan cloud or VPS (for example Safaricom Cloud, Truehost or Sasahost) or a nearby region.

```bash
docker build -t vybecrew .
docker run -d --restart unless-stopped -p 3000:3000 --env-file /etc/vybecrew.env vybecrew
```

- The image runs the standalone Next.js server on port 3000 in Nairobi time, with a health check at `/api/health`. Put a reverse proxy with HTTPS (Caddy or Nginx with Let's Encrypt) in front of it.
- `NEXT_PUBLIC_*` values are read at build time: build the image with the production values present (for example `--build-arg` or a `.env.production` file that is not committed).
- Database, storage and sign-in are Supabase. Create the hosted project in the closest region, run `npx supabase link` and `npx supabase db push` to apply the migrations, and turn on **email confirmations** in Authentication settings (admins can only be added once their email is confirmed).
- Daily housekeeping: have cron call the cleanup once a day. It deletes drafts untouched for 90 days (never ordered, not in a cart) with their pictures, and old rate-limit records:

  ```bash
  curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<your site>/api/cron/cleanup
  ```

- Data protection: register with the Office of the Data Protection Commissioner (ODPC) as a data controller and fill in the business details (`NEXT_PUBLIC_BUSINESS_*`, `NEXT_PUBLIC_CONTACT_*`), which appear on the terms, privacy, refunds, delivery and contact pages. Customers can download their data and delete their account at `/account`.

## Admins

The first admin is set in the database. After the person has signed up, run in the Supabase SQL editor:

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'owner@example.com');
```

After that, admins add and remove each other at `/admin/admins` (the person must have signed up and confirmed their email; nobody can remove themselves). Non-admins get a 404 on every `/admin` page and API.

What admins can do:

- **Orders** (`/admin/orders`): search by name, phone, town, county, order number, tracking number, payment reference or private note; filter by status and date; export CSV for the accountant. On an order: move it on (courier and tracking when it ships), move it back a step after a mis-click, cancel it before it ships (the customer is told why by email and SMS), record an M-Pesa refund, add a private note, regenerate missing files.
- **Payments** (`/admin/payments`): payments that need a refund, and the latest payments with their status.
- **Review queue** (`/admin/review`): designs the automatic check was unsure about, with the reason, the customer and how long it has waited.
- **Catalogue** (`/admin/catalogue`): post, edit (title, description, colours), feature (listed first), publish, hide and delete ready-made designs.
- **Prices** (`/admin/settings`): selling prices, print costs, back print, both delivery fees (Nairobi area and the rest of Kenya) and bulk discounts.

## Tests

```bash
npx vitest run          # unit and database tests (no Docker needed)
npx playwright test     # browser tests (starts its own dev server on port 3100)
# If `npm run dev` is already running (Next.js allows one per project), test against it instead:
#   E2E_BASE_URL=http://localhost:3000 npx playwright test
# The browser tests need the local database: `npx supabase start`
```

The database rules (row-level security, the freeze-after-order trigger, the order-matches-design trigger) are tested against a real in-process Postgres (PGlite) using the actual migrations.

## Before real customers

| What | Where |
|---|---|
| Selling prices, print costs, delivery fees, bulk discounts | the admin Prices page |
| Print areas (confirmed: tee front 27 x 32 cm, hoodie front and back 25 x 28 cm; tee back 28 x 32 cm) and the minimum print resolution (150 dpi) | `lib/catalog.ts`. Confirm file format and white underlayer for dark garments with your printer |
| M-Pesa Go Live, Celcom sender name, Resend domain (`vybecrew.co.ke`), OpenAI key | environment settings, see above |
| Business name, registration name, contact phone, WhatsApp and email | `NEXT_PUBLIC_BUSINESS_*` and `NEXT_PUBLIC_CONTACT_*` |
| The banned-word list (English, Swahili and Sheng) | `lib/moderation/banned-words.json` |
| Have a lawyer read the terms, privacy and refunds pages | `app/terms`, `app/privacy`, `app/refunds` |

## Safety checks: what they do and don't catch

- **Text** is matched against a word list in English, Swahili and Sheng, after removing invisible characters and accents and mapping look-alike letters. Words that are also ordinary words or names go to human review instead of being rejected. It does **not** catch masked spellings such as `f*ck` or slang that is not on the list. Add words as real cases appear.
- **Pictures** are checked by OpenAI's moderation model (`OPENAI_API_KEY`) on a 768 px copy. Clearly sexual pictures are rejected; possibly sexual ones, and pictures that may show hate, violence, harassment or self-harm, go to human review. A failed check always goes to human review, never straight to payment.
- The reasons are shown to admins only; customers just see "Waiting for review", so the check doesn't teach anyone how to get around it.

Treat the checks as a first line, not a guarantee. Review the queue regularly.

## Known limits

- **Rendering runs inside the web server.** During testing, one full test run had a native crash in the image library that never happened again in many further runs. Before heavy traffic, move mockup and design-file rendering into a separate worker so a crash cannot take down the website.
- Customers need an account to design (no guest designing yet).
- Emails and the app are in English (Arabic-script text on garments is supported).
- A single admin role: every admin can do everything.

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
- Text in the default ink follows the garment color (dark on light shirts, white on dark ones); a color the customer picked is kept.
- Undo and redo cover every change, images included. Duplicate, Bring to front and Send to back change the stacking order; the printed file uses the same order.

## Printing on the back, and saving for later

- **Front and back.** The design page has Front and Back tabs. Each side has its own artwork, its own undo history, and its own garment photo and print area. Printing the back adds a fixed extra to the price and to your cost, with starting values in `lib/catalog.ts` (KES 500 to the customer, KES 400 cost) that the admin Prices page overrides. Confirm the T-shirt back print area (28 x 32 cm) with your printer; the hoodie back (25 x 28 cm) is confirmed.
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
- **Orders** (`/admin/orders`): see the Admins section above.
- **Private note** on each order page; customers never see it.
- **Alerts:** the admin menu shows how many designs wait for review and how many paid orders are new, and every new paid checkout emails the admins. Set `ADMIN_ALERT_EMAILS` (comma separated) to choose who; otherwise every admin account is emailed.
- **Prices** (`/admin/settings`): customer price and printer cost for each item, the back-print extra, and the delivery fees. They apply to new carts and checkouts; paid orders keep the price they were paid at. The numbers in `lib/catalog.ts` are only the starting values.

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

Customers pay less per piece when they order more. The owner sets up to five bulk prices on the admin Prices page ("Order 10 or more and save 10%"). Every piece in the cart counts towards them, across designs (up to 500 pieces), and the biggest one reached applies to every piece, garment and back print alike. The starting set is 5+ save 5%, 10+ save 10%, 25+ save 15%. Bulk prices lower what the customer pays but not what the printer charges, so profit on those orders is smaller. The paid order keeps the discounted price. Customers see the offer on the home page and the catalogue design page, and a "Bulk price" badge in the cart once it applies.

The header shows an Admin link to signed-in admins.

## Logo and starter catalogue

The logo's original is `assets/brand/vybecrew-logo-source.jpg` (light art on black). `node scripts/make-brand.mjs` turns it into the transparent site logo (`public/brand/vybecrew-logo.png`), the page icons, the share picture and the catalogue art in `assets/brand/`. The black background becomes transparent, so the logo is meant for black surfaces: the site's black bars and panels, and black garments.

`scripts/seed-brand-catalogue.mjs` posts and publishes eight starter designs (logo on black T-shirts and hoodies: front, back, chest and back, front and back) through the admin page: `ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/seed-brand-catalogue.mjs` with the app running. Add `REPLACE=1` to delete and re-post designs that already exist. Run it against the live site once it is deployed. The original is only about 830 pixels wide, so the artwork is enlarged for print; ask for a larger or vector version for the best print quality.

## Garment colours and photos

T-shirts come in ten colours: black, white, heather grey, navy blue, royal blue, green, burgundy, red, orange and yellow. Hoodies come in the same colours except orange. The colours, their names and swatches are in `lib/garmentColors.json` (the ids stay short: `grey`, `blue`, `maroon`); which item comes in which colour is `colors` in `lib/catalog.ts`; migrations `0010` and `0011` hold the database to the same lists.

Every picture is a real photo. The originals are in `assets/garments/<tee|hoodie>/<colour>.webp`: 1448 x 1086, front on the left half, back on the right. `node scripts/make-garments.mjs` splits each one, pads each half at the sides with the backdrop colour to the app's 4:5 frame (nothing is cropped), and writes 800 x 1000 JPEGs to `public/garments/`. To add a colour: add the photo with the same framing, add the colour to `garmentColors.json` and the `Color` type, update the migration lists, and run the script.

The print areas are placed by measurement (`GEOMETRY` in `lib/editorGeometry.ts`): the T-shirt is about 415 px across the chest per half, a size M's 51 cm, so 8.14 px per cm; hoodies share the scale (same model and camera). Each area is centred on the body and measured down from the collar seam, except the hoodie back, which starts 2 cm below the hood. The T-shirt front is 27 cm wide by 32 cm tall.

Mockups (customer previews, catalogue pictures, the printer's reference mockup) are JPEGs, a tenth of the size of a PNG with a photo behind them. The printer's design file stays a transparent PNG at 150 DPI.

Designs store positions as fractions of the print area, so changing a print area's size changes how existing designs print. After changing one, re-post the catalogue with `REPLACE=1` (see the logo section above).
