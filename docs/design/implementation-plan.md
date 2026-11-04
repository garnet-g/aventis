# Custom Apparel Platform Implementation Plan


**Goal:** A phone-first web app where Pakistani customers place a design or name inside a fixed print area on a T-shirt or hoodie, pass a safety check, pay (dummy provider in v1), and where admins receive paid orders with a mockup and a standalone design file to forward to their printer.

**Architecture:** Next.js App Router app. Supabase provides Postgres (with row-level security), email auth and private file storage. All trust decisions (moderation result, payment, artifact creation, status changes) happen in server code, never in the browser. Payment and image-safety sit behind small interfaces so real providers can be swapped in later.

**Tech Stack:** Next.js (TypeScript, App Router), Tailwind CSS, Fabric.js, Supabase (`@supabase/supabase-js`, `@supabase/ssr`), sharp (server-side image compositing), Vitest (unit/integration), Playwright (end-to-end), Zod (input validation).

**Spec:** `docs/design/design-spec.md`

## Global Constraints

- Catalog at launch: **T-shirt and Hoodie; White and Black; sizes S, M, L, XL.**
- Print area is fixed per item; customers cannot place art outside it.
- **Front print only** in v1 (no back view, no art library, no sleeves).
- Printer receives both the **garment mockup with the design** and the **standalone design image**.
- Moderation: clearly explicit -> rejected; unsure -> payment blocked, customer sees "Waiting for review", admin approves (customer may then pay) or rejects; clearly fine -> straight to payment.
- PKR currency; Pakistani address format (name, phone, city, province, address); no cash on delivery.
- Payments behind a single interface; v1 ships a clearly labeled **TEST MODE** dummy provider that always succeeds.
- Owner's cost to print: **PKR 1,300 per hoodie, PKR 800 per T-shirt.** Selling prices and delivery fee are admin-editable placeholders.
- Order statuses: `paid` -> `at_printer` -> `shipped` -> `delivered`.
- One item per order; customers sign in with email (no guest checkout); a single admin role.
- Phone-first UI. Customer uploads are stored privately and are never publicly guessable.
- Nothing reaches admins/printer until payment succeeds; mockup and design file are generated at payment confirmation and stored with the order.
- Placeholders awaiting the owner/printer (keep each in one config location): print-area size in cm, minimum DPI, selling prices, delivery fee.

## Review Focus

1. **Paying for an unapproved design** by calling the payment endpoint directly -> refused with 403; no order created.
2. **Editing a design after approval** (moving/replacing art) -> approval is cleared and the design is re-checked before payment.
3. **Duplicate payment confirmation** (double click, retry, repeated webhook) -> exactly one paid order and one set of files.
4. **Urdu / Arabic-script and emoji text** as a name -> renders correctly (right-to-left) in the preview, the mockup and the design file, and passes the text check without crashing.
5. **Corrupt, oversized, or non-image upload** (e.g. a `.png` that is really text, a 50 MB file) -> clear rejection message; no server error.

---

## File Structure

```
app/
  (customer)/design/page.tsx        editor page
  (customer)/checkout/[designId]/page.tsx
  (customer)/orders/page.tsx        customer's own orders + design status
  admin/review/page.tsx             moderation queue
  admin/orders/page.tsx, [id]/page.tsx
  api/designs/route.ts, [id]/submit/route.ts, [id]/upload/route.ts
  api/pay/route.ts
  api/admin/designs/[id]/decision/route.ts
  api/admin/orders/[id]/status/route.ts
components/Editor.tsx               Fabric canvas, print-area constrained
lib/catalog.ts                      products, colors, sizes, print areas, prices
lib/printArea.ts                    geometry (clamp, fit)
lib/upload.ts                       upload validation
lib/moderation/{index,text,image}.ts
lib/payments/{index,dummy}.ts
lib/artifacts.ts                    mockup + design file generation
lib/orders.ts                       status transitions, order creation
lib/notify.ts                       email on review decision
lib/supabase/{server,client}.ts
supabase/migrations/0001_init.sql
public/garments/{tee,hoodie}-{white,black}.png   placeholder garment photos
tests/                              mirrors lib/ and app/api/
```

---

### Task 1: Project scaffold and catalog

**Files:**
- Create: project via `create-next-app` (TypeScript, Tailwind, App Router) in the project folder; `lib/catalog.ts`; `vitest.config.ts`; `.gitignore` (include `.env*.local`)
- Test: `tests/catalog.test.ts`

**Interfaces:**
- Produces: `type ProductId = 'tee' | 'hoodie'`, `type Color = 'white' | 'black'`, `type Size = 'S'|'M'|'L'|'XL'`, `type PrintArea = { widthCm: number; heightCm: number; topOffsetCm: number }`, `catalog: Record<ProductId, { label: string; costPkr: number; pricePkr: number; printArea: PrintArea; garmentImage: (c: Color) => string }>`, `COLORS: Color[]`, `SIZES: Size[]`, `DELIVERY_FEE_PKR: number`, `MIN_DPI: number`.

- [ ] **Step 1: `git init`, scaffold the app, add Vitest; commit the empty scaffold.**
- [ ] **Step 2: Write failing tests:** `catalog has exactly tee and hoodie`; `colors are white and black`; `sizes are S,M,L,XL in order`; `cost is 800 for tee and 1300 for hoodie`; `every product has positive print area dimensions`.
- [ ] **Step 3: Run `npx vitest run tests/catalog.test.ts`; expected FAIL.**
- [ ] **Step 4: Implement `lib/catalog.ts`.** Placeholders: print area tee 28×32 cm, hoodie 25×28 cm; `pricePkr` tee 1500, hoodie 2200 (cost + margin); `DELIVERY_FEE_PKR` 250; `MIN_DPI` 150. Mark each with `// PLACEHOLDER: confirm with owner/printer`.
- [ ] **Step 5: Run tests; expected PASS. Commit.**
- [ ] **Step 6: Add four placeholder garment photos under `public/garments/` (simple flat white/black tee and hoodie images, any source with a usable licence, same pixel size per product).**

### Task 2: Database schema, access rules, storage

**Files:**
- Create: `supabase/migrations/0001_init.sql`, `lib/supabase/server.ts`, `lib/supabase/client.ts`, `.env.local.example`
- Test: `tests/rls.test.ts` (runs against local Supabase via `supabase start`)

**Interfaces:**
- Produces tables: `profiles(id uuid pk -> auth.users, is_admin bool default false)`; `designs(id, user_id, product text, color text, size text, layers jsonb, status text check in ('draft','pending_review','approved','rejected'), reject_reason text, created_at, updated_at)`; `orders(id, design_id unique, user_id, status text check in ('paid','at_printer','shipped','delivered'), cost_pkr int, price_pkr int, delivery_fee_pkr int, name, phone, city, province, address, payment_ref text unique, mockup_path, design_file_path, created_at)`; private storage buckets `uploads`, `artifacts`. Helper `getServerClient()` (user session) and `getServiceClient()` (service role, server-only).
- RLS: customers read/write only their own `designs` rows and read only their own `orders`; customers cannot set `designs.status` to `approved` or `orders.*` at all (server uses service client); admins read everything.

- [ ] **Step 1: Write failing tests:** `customer A cannot read customer B's design`; `customer cannot update own design status to approved`; `customer cannot insert an order`; `customer cannot read files in artifacts bucket`; `admin can read all orders`.
- [ ] **Step 2: Run; expected FAIL.** **Step 3: Write the migration and clients. Step 4: `supabase db reset`, run tests; expected PASS. Step 5: Commit.**

### Task 3: Auth and admin gate

**Files:** Create `app/login/page.tsx`, `middleware.ts`, `lib/auth.ts`. Test: `tests/auth.test.ts`

**Interfaces:**
- Consumes: Task 2 clients and `profiles`.
- Produces: `requireUser(): Promise<User>` (redirects to `/login`), `requireAdmin(): Promise<User>` (404 for non-admins), email sign-in (magic link or email+password; builder's choice, documented in a README line).

- [ ] **Step 1: Failing tests:** `requireAdmin rejects a non-admin user`; `requireUser rejects anonymous`.
- [ ] **Step 2–5: Run (FAIL), implement, run (PASS), commit.**

### Task 4: Print-area geometry and upload validation

**Files:** Create `lib/printArea.ts`, `lib/upload.ts`. Test: `tests/printArea.test.ts`, `tests/upload.test.ts`

**Interfaces:**
- Produces: `type Rect = { x: number; y: number; width: number; height: number }`; `clampToPrintArea(rect: Rect, area: Rect): Rect` (moves, then shrinks if larger than area, preserving aspect ratio); `validateUpload(meta: { mime: string; bytes: number; widthPx: number; heightPx: number }, area: PrintArea): { ok: true } | { ok: false; reason: string }`.
- Rules: mime in `image/png`, `image/jpeg`; max 10 MB; effective DPI = `widthPx / (area.widthCm / 2.54)` must be >= `MIN_DPI`.

- [ ] **Step 1: Failing tests:** `rect partly outside area is moved inside`; `rect larger than area shrinks to fit keeping aspect ratio`; `rect already inside is unchanged`; `gif is rejected with a format message`; `11 MB png is rejected with a size message`; `image below MIN_DPI at the print width is rejected and the message states the minimum pixel width`; `valid png passes`. **Review Focus 5:** `file with image mime but 0 bytes or NaN dimensions is rejected, not thrown`.
- [ ] **Step 2–5: Run (FAIL), implement, run (PASS), commit.**
- [ ] **Step 6: `POST /api/designs/[id]/upload`** reads image dimensions with sharp from the actual bytes (never trusts the client's claim), calls `validateUpload`, stores to the `uploads` bucket under `{userId}/{designId}/{uuid}.png|jpg`. Test: `upload of a text file renamed .png returns 400 with a message`.

### Task 5: Moderation

**Files:** Create `lib/moderation/{index,text,image}.ts`, `lib/moderation/banned-words.json`. Test: `tests/moderation.test.ts`

**Interfaces:**
- Produces: `type Verdict = 'clear' | 'unsure' | 'explicit'`; `moderateText(texts: string[]): Verdict`; `interface ImageSafetyProvider { score(image: Buffer): Promise<{ explicit: number }> }` (0–1); `moderateImages(images: Buffer[], provider: ImageSafetyProvider): Promise<Verdict>` (explicit >= 0.85; unsure >= 0.4; else clear); `moderateDesign(input: { texts: string[]; images: Buffer[] }, provider): Promise<Verdict>` returns the worst verdict. A `StubImageSafetyProvider` (configurable score) ships for tests and local dev; the builder picks and wires one real vendor behind the interface and records the choice in the README.
- Banned words list covers English and Roman Urdu, plus Urdu-script terms; matching is case-insensitive and ignores zero-width characters and repeated separators (`f.u.c.k`).

- [ ] **Step 1: Failing tests:** `banned word in text is explicit`; `obfuscated banned word with dots is explicit`; `clean Urdu-script name is clear`; `emoji-only text is clear and does not throw`; `image score 0.9 is explicit, 0.5 unsure, 0.1 clear`; `moderateDesign returns the worst verdict across texts and images`; `provider error yields unsure (fail toward human review, never clear)`.
- [ ] **Step 2–5: Run (FAIL), implement, run (PASS), commit.**

### Task 6: Editor with print-area constraint

**Files:** Create `components/Editor.tsx`, `app/(customer)/design/page.tsx`. Test: `tests/e2e/editor.spec.ts` (Playwright, mobile viewport)

**Interfaces:**
- Consumes: Task 1 catalog, Task 4 `clampToPrintArea`.
- Produces: `<Editor product color size onChange />` where `onChange(layers: DesignLayer[])`; `type DesignLayer = { kind: 'image'; uploadPath: string; rect: Rect; rotation: number } | { kind: 'text'; text: string; font: string; fill: string; rect: Rect; rotation: number }`; editor exposes `exportDesignPng(): Promise<Blob>` (transparent background, print-area pixels at `MIN_DPI`, but see Task 9: server regenerates the authoritative file).
- UI: item/color/size pickers; Upload; Add name/text; dashed print-area box over the garment photo; objects are clamped on move/scale/rotate; text uses a font stack that includes an Urdu-capable font (e.g. Noto Nastaliq Urdu) and sets `direction` per text.

- [ ] **Step 1: Failing Playwright tests:** `dragging an uploaded image beyond the dashed box leaves it inside the box`; `entering an Urdu name renders it right-to-left` (screenshot text check by reading layer metadata `direction: 'rtl'`); `editor is usable at 375px width without horizontal scroll`.
- [ ] **Step 2–5: Run (FAIL), implement, run (PASS), commit.**

### Task 7: Design submission and moderation outcome

**Files:** Create `app/api/designs/route.ts`, `app/api/designs/[id]/submit/route.ts`, `lib/designs.ts`. Test: `tests/designs.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 3, 5.
- Produces: `saveDesign(userId, input): Promise<Design>` (always status `draft`, and resets any prior approval); `submitDesign(designId, userId): Promise<{ status: 'approved' | 'pending_review' | 'rejected'; message: string }>` — moderates all text layers and uploaded images (downloaded server-side from storage); `clear` -> `approved`, `unsure` -> `pending_review` ("Waiting for review"), `explicit` -> `rejected` with a reason shown to the customer.

- [ ] **Step 1: Failing tests:** `clear design becomes approved`; `unsure design becomes pending_review`; `explicit design becomes rejected with reason`; `another user cannot submit my design`; **Review Focus 2:** `saving changed layers on an approved design resets status to draft`; `submit twice on the same unchanged design returns the same result without re-moderating`.
- [ ] **Step 2–5: Run (FAIL), implement, run (PASS), commit.**

### Task 8: Payments (interface, dummy provider, checkout)

**Files:** Create `lib/payments/{index,dummy}.ts`, `lib/orders.ts` (createPaidOrder), `app/api/pay/route.ts`, `app/(customer)/checkout/[designId]/page.tsx`. Test: `tests/pay.test.ts`

**Interfaces:**
- Produces: `interface PaymentProvider { name: string; isTestMode: boolean; charge(args: { amountPkr: number; reference: string }): Promise<{ ok: true; paymentRef: string } | { ok: false; reason: string }> }`; `getPaymentProvider(): PaymentProvider` chosen by env `PAYMENT_PROVIDER` (default `dummy`); `DummyProvider` always succeeds and returns `paymentRef = "TEST-" + reference`; `createPaidOrder(args: { designId: string; userId: string; delivery: DeliveryDetails }): Promise<Order>` — server computes amount from catalog (`pricePkr + DELIVERY_FEE_PKR`), never from the client, and requires design `status === 'approved'`.
- `DeliveryDetails = { name: string; phone: string; city: string; province: string; address: string }`, validated with Zod (Pakistani mobile format `03XXXXXXXXX` or `+923XXXXXXXXX`).
- Checkout page shows a visible **TEST MODE – no real money is charged** banner whenever `isTestMode`.

- [ ] **Step 1: Failing tests:** **Review Focus 1:** `pay on a pending_review design returns 403 and creates no order`; `pay on a rejected design returns 403`; `amount charged equals catalog price plus delivery fee regardless of client body`; **Review Focus 3:** `two simultaneous pay calls for one design create exactly one order` (unique `design_id` and `payment_ref`); `invalid phone number is rejected with a field error`; `dummy provider result is marked test mode in the order's payment_ref`.
- [ ] **Step 2–5: Run (FAIL), implement, run (PASS), commit.**

### Task 9: Artifact generation (mockup and design file)

**Files:** Create `lib/artifacts.ts`. Modify `lib/orders.ts` to call it. Test: `tests/artifacts.test.ts`

**Interfaces:**
- Consumes: Task 1 catalog, design layers, uploaded files.
- Produces: `renderDesignPng(design: Design): Promise<Buffer>` (transparent PNG exactly `printArea` size at `MIN_DPI`, layers placed per their rect/rotation, text rendered with an Urdu-capable font via sharp's SVG text support or a server canvas); `renderMockupPng(design: Design): Promise<Buffer>` (garment photo for the chosen color with the design composited into the print area); `storeArtifacts(orderId: string, files: { mockup: Buffer; design: Buffer }): Promise<{ mockupPath: string; designFilePath: string }>` to the private `artifacts` bucket.
- `createPaidOrder` generates and stores both files **after payment succeeds and before the order is returned**; if generation fails the order stays `paid` with an `artifacts_failed` flag and an admin "Regenerate files" button (Task 10) fixes it.

- [ ] **Step 1: Failing tests:** `design PNG dimensions equal print area at MIN_DPI`; `design PNG has transparent pixels outside placed layers`; `mockup PNG has the garment's dimensions`; `Urdu text layer produces non-empty pixels` (not blank boxes); `generation failure leaves the order paid with artifacts_failed true`; `rerunning generation for the same order overwrites rather than duplicates files`.
- [ ] **Step 2–5: Run (FAIL), implement, run (PASS), commit.**

### Task 10: Admin review queue and order management

**Files:** Create `app/admin/review/page.tsx`, `app/admin/orders/page.tsx`, `app/admin/orders/[id]/page.tsx`, `app/api/admin/designs/[id]/decision/route.ts`, `app/api/admin/orders/[id]/status/route.ts`, `app/api/admin/orders/[id]/regenerate/route.ts`. Test: `tests/admin.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, Tasks 7–9.
- Produces: `decideDesign(designId: string, decision: 'approve' | 'reject', reason?: string): Promise<void>` (only from `pending_review`); `nextStatus(current: OrderStatus): OrderStatus | null` (exactly `paid`->`at_printer`->`shipped`->`delivered`, no skipping or going back); `advanceOrder(orderId: string): Promise<Order>`; `signedDownloadUrl(path: string): Promise<string>` (60-second signed URL).
- Order detail shows mockup, design file download buttons, customer delivery details, cost vs selling price vs profit (`price + delivery fee − cost`), and status button labelled with the next step.

- [ ] **Step 1: Failing tests:** `non-admin gets 404 on every admin route`; `approve moves pending_review to approved`; `approve on an already rejected design is refused`; `nextStatus follows paid, at_printer, shipped, delivered and null after delivered`; `advanceOrder refuses to skip a step`; `download URL expires after 60 seconds`; `profit equals price plus delivery fee minus cost`.
- [ ] **Step 2–5: Run (FAIL), implement, run (PASS), commit.**

### Task 11: Customer status and notifications

**Files:** Create `lib/notify.ts`, `app/(customer)/orders/page.tsx`. Modify decision route. Test: `tests/notify.test.ts`

**Interfaces:**
- Produces: `notifyDecision(args: { to: string; decision: 'approved' | 'rejected'; reason?: string }): Promise<void>` using an email service (Resend or similar behind a small interface; a console logger in dev). The orders page shows each design's state in plain words: "Waiting for review", "Approved – ready to pay" (link to checkout), "Rejected: <reason>" (link to start over), and each order's status.

- [ ] **Step 1: Failing tests:** `approve sends an email with a checkout link`; `reject sends the reason`; `email failure does not roll back the decision`; `orders page lists only the signed-in customer's items`.
- [ ] **Step 2–5: Run (FAIL), implement, run (PASS), commit.**

### Task 12: End-to-end flow and phone pass

**Files:** Test: `tests/e2e/full-flow.spec.ts`; Modify: any component failing the phone checks.

- [ ] **Step 1: Write Playwright tests (375px viewport, local Supabase, stub image-safety provider, dummy payments):** `customer designs, passes check, pays in test mode, admin sees paid order and downloads both files`; `unsure design shows "Waiting for review", pay is blocked, admin approves, customer then pays`; `explicit design is rejected and cannot be paid`; `rejected customer can start over with a new design`.
- [ ] **Step 2: Run; fix failures; run until PASS.**
- [ ] **Step 3: Write `README.md`:** how to run locally (`supabase start`, env vars), how to make a user an admin, which moderation vendor was wired, the placeholder values that await the owner/printer, and how to add a real payment provider. Commit.
