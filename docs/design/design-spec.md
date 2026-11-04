# Custom Apparel Platform: Design (v1)

## Intent and why
A web app (phone-first) where customers in Pakistan put their own design or name on a shirt or hoodie, inside a fixed print area, pay, and receive the item. The owners ("admins") do not print. A partnered printer does. Admins receive paid orders, check the artwork, hand the files to the printer, and coordinate delivery. Inspired by customink.com but deliberately much smaller: no print-on-demand integration, no group orders, no quotes.

## Goals
- Customer can: pick an item (shirt/hoodie), color, size; add an uploaded image and/or name/text; move/resize/rotate it **only inside a predetermined print area**; see a preview on the garment; pay.
- Design is locked behind a paywall: nothing reaches admins until payment succeeds.
- Every design passes a safety and printability check **before** the customer can pay.
- Admins see paid orders and can download, per order: (1) a mockup (garment with design placed) and (2) the design as its own image file. Admins send these to the printer manually and update order status.
- Payments work in test mode first with a dummy provider; real providers are plugged in later.

## Non-goals (v1)
- Printer integration or automatic sending to the printer (admins do this by hand).
- Group orders, Names & Numbers for teams, fundraising, team stores, AI design, sleeve designs.
- Cash on delivery.
- More products/colors than listed below ("let's get these right, then advance").

## Anti-goals (a failure even if it technically works)
- Explicit material reaching the printer.
- An order marked paid that wasn't really paid, or paid design files visible without payment.
- A design that looks right in the editor but prints at the wrong size/position, or is too low-resolution to print.
- Dummy/test payments mistaken for real ones.

## Decisions made by the owner
- Catalog at launch: **T-shirt and Hoodie; White and Black; sizes S, M, L, XL.**
- Print area is fixed per item (the customer cannot place art outside it).
- Printer needs both the **garment mockup with the design** and the **standalone design image**; admins collect and forward them.
- **Moderation:** clearly explicit -> rejected. Unsure -> payment blocked, customer sees "Waiting for review", admin approves (customer may then pay) or rejects. Clearly fine -> straight to payment.
- Customers are in Pakistan. Prices/payments in PKR. No COD.
- Owners have a bank account for receiving payments. Real gateway accounts come later; **start with a dummy payment** for testing.
- It is a web app.

## Owner's guesses I confirmed implicitly ("looks decent") - still treated as proposals
- Back view of garment, art library: **not in v1** (my call, see below).
- Order statuses: Paid -> At printer -> Shipped -> Delivered.
- Customer provides delivery details (name, phone, address) at checkout.

## Builder's calls (my decisions, not owner-approved - owner may change)
- Stack: Next.js (React) + Tailwind, phone-first; Fabric.js canvas for the editor; Supabase (Postgres, auth, file storage); hosting on Vercel + Supabase free tiers.
- **Front print only** in v1. Back view and art library deferred.
- Payments behind a single "take payment" interface; v1 ships a clearly labeled **TEST MODE** dummy provider that always succeeds. Real PK providers (e.g. JazzCash, Easypaisa, a bank gateway such as Safepay/PayFast) are later swaps, to be verified against their current terms then. Optional later: admin manually marks an order "Paid" after verifying a bank transfer.
- Pricing: owner's **cost to print** is PKR 1,300 per hoodie and PKR 800 per T-shirt (owner-stated; I assume PKR and that this cost excludes delivery). The **selling price** is not decided: one flat price per item type, editable by admins, with placeholders (cost + a margin) until the owner sets it. The admin screen should show cost vs. selling price per order so profit is visible. Delivery fee: undecided, placeholder flat fee. No quantity discounts. One item per order in v1 (cart later) - **flag**: owner should confirm whether multi-item carts are needed.
- Customers sign in (email) so designs and orders are saved; guest checkout not in v1.
- A single admin role (any admin can review designs and manage orders).
- Printability check on upload: minimum resolution for the print area, allowed formats (PNG/JPG), max file size; clear rejection message so the customer can fix it.
- Safety check: automated image-safety service on uploaded images plus a banned-word list for text; results of **explicit / unsure / clear** feed the review queue. Exact vendor left to the builder.
- Customer is notified (email and on-screen) when review is decided. A rejected design can be replaced with a different one.
- Mockup and design file are generated on the server at the moment of payment confirmation and stored with the order, so what admins download is exactly what was approved and paid.
- Print area dimensions: placeholder sizes until the printer confirms real ones. **The printer's actual requirements (file format, DPI, print area size in cm, whether a white underbase is needed on black garments) must be confirmed with the printer before print files can be finalized.**

## Constraints
- Phone-first UI; Pakistani address format; PKR.
- Must work on free/cheap hosting to start.
- Customer designs may be user-uploaded images: store privately, never publicly guessable.

## Left to the builder
- Component structure, database schema, exact editor UX, visual styling, choice of moderation vendor, email service, file naming, test strategy.

## Open items for the owner
1. Selling price (PKR) per item, and whether to charge a delivery fee (costs to print are known: hoodie 1,300, tee 800).
2. Printer's file requirements (format, DPI, print area size, black-garment handling).
3. Multi-item carts needed in v1?
