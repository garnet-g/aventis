# To be done

Ideas and planned work for VybeCrew, not built yet. Items 1 and 2 are the ones you asked for; the rest are suggestions. Within each group the most useful come first.

## Planned

### 1. More products and colours
- Add caps, tote bags and mugs alongside T-shirts and hoodies.
- Add more garment colours than white and black (for example red, navy, green, grey).
- What this touches: the product list in `lib/catalog.ts`, a print area and garment photo for each product and colour (`scripts/make-garments.mjs`, `lib/printArea.ts`), selling price and printer cost for each product on the admin Prices page, and the colour and size pickers (mugs and tote bags have no sizes).
- Questions to settle first: which products and colours the printer can actually do, their print costs and minimum quantities, and whether a mug's wrap-around print area needs a different editor.

### 2. Order tracking and SMS updates for customers
- Send the customer an SMS when their order moves to Shipped (and optionally Paid and Delivered), using Celcom. The SMS credentials already exist; keep them in `.env.local` and the host's environment settings, never in the code or this file.
- A tracking page where a customer sees their order's status, with the same wording as the admin statuses (Paid, At printer, Shipped, Delivered).
- Where it plugs in: the admin status change (`advanceAndNotify` in `lib/admin.ts`) and `lib/notify.ts`, which already sends the emails. A new Celcom sender can sit next to the email one.
- Questions to settle first: which statuses send an SMS, the wording, a Kenyan sender name, what to do when the SMS fails (it should never block the status change), and whether customers can opt out. WhatsApp can come later.

## Needed before going live

### 3. Real payments with M-Pesa
Payment is still the test provider. Options: Safaricom's own API (STK push), or an aggregator such as Pesapal or Flutterwave that also takes cards. The payment code already treats the cart fingerprint as an idempotency key, so a real provider can be added in `lib/payments/`.

### 4. Delivery fee by area
One flat fee will not suit Kenya. Charge by county or zone (Nairobi cheaper than Mombasa or upcountry), with a free-delivery threshold as an option.

### 5. Hosting and email
Put the app on a host such as Vercel with a hosted database and storage, set a real email sender for approval and order emails, and check the upload size limit on the host.

### 6. Printer details
Get the print area sizes, minimum picture quality and file requirements from the printing partner, and update the placeholders.

### 7. Real prices
Set real selling prices, print costs, delivery fee and bulk prices on the admin Prices page.

## Good features to add later

### Selling
- Discount codes, for example a launch offer or a code for a group.
- Team and event orders: one design for a group, with each person choosing a size.
- Reorder a past order in one click.
- A wishlist or saved designs shown on a customer's account page.

### Customers
- Customer accounts page with their addresses, so checkout is faster next time.
- Email or SMS when a design is approved or rejected, with the reason.
- A size guide on the product pages.
- A design gallery of customer-made designs shared with permission.

### Admin
- A sales dashboard: orders, revenue and profit by day or week, best sellers.
- Export orders to a spreadsheet for the printer or accounts.
- Print the order's artwork, address and packing details on one sheet.
- Admin accounts with different roles, for example someone who only reviews designs.
- Refund button tied to the payment provider.

### Design tools
- More fonts and a clip-art or sticker library to place on a design.
- Templates: ready layouts a customer can start from.
- Better background removal for things other than people photos.

### Quality and upkeep
- Fix the remaining lint errors and warnings.
- Move design rendering to a background worker so busy times do not slow the site.
- Update the old design documents in `docs/design/`, which still mention Pakistan and PKR.
- Error monitoring and backups for the live database.
