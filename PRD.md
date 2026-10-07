# Public Event Management Platform — PRD and Four-Person Build Plan

Status: **Draft for team review**  
Delivery window: **14 days**  
Confirmed stack: **React, Node.js, Express, Prisma, PostgreSQL**  
Confirmed scope: **Public events with free registration or paid tickets**

## 1. Objective and scope decisions

Build a web application where visitors discover public events, attendees obtain tickets, and organizers create events and manage attendance. The project must demonstrate a complete free booking and a complete paid sandbox booking, including server-verified payment and check-in.

The target is a working, deployed student-project MVP. A real commercial ticketing marketplace is a larger product because refunds, payouts, support, and financial reconciliation become essential.

### Proposed defaults — review on Day 1

These are recommendations, not requirements already approved by the team.

| Decision | Proposed MVP default | Reason / consequence |
|---|---|---|
| Payment environment | Provider sandbox only; visibly label test payments | Demonstrate payment integration without collecting real money |
| Payment provider | Choose one provider with an available team sandbox account on Day 1 | Provider-neutral API contract below; do not integrate two providers |
| Ticket quantity | One ticket per account per event | Avoid cart, guest details, group booking, and quantity refund rules |
| Pricing | One price per event, one project currency | Free means zero; paid means a positive amount; no tier inventory |
| Roles | ATTENDEE, ORGANIZER, ADMIN | Organizers also have all attendee capabilities |
| Organizer access | Admin promotes an attendee to organizer | Prevent self-assigned privileges; seed an organizer for the demo |
| Publishing | Organizers publish directly; admin can hide an event | No approval workflow in this version |
| Venue | Physical events with venue name and address | No maps integration or virtual meeting integration |
| Cancellation | Attendees can cancel free tickets before the event; paid ticket cancellation is unavailable | Paid refunds need a separate policy; explain this before checkout |
| Event cancellation | Allow free-event cancellation; block paid-event cancellation while tickets or payment holds exist | Avoid collecting payments for a cancelled event without a refund workflow |
| Event editing | Drafts editable; published content editable only before any active booking | Prevent buyers receiving a different event or price after booking |
| Ticket delivery | In-app ticket with opaque ticket code; browser print | No email/SMS or PDF-generation service needed |
| Check-in | Organizer enters ticket code or selects a ticket in attendee list | Camera scanning is optional after core flows work |
| Media | Seeded/local images and a small set of selectable covers | Avoid upload storage and remote-image validation in the deadline |

If real payments or paid-event cancellation are required, revise this plan before implementation. Do not quietly enable live payment credentials.

## 2. Users and permissions

| Actor | Allowed actions |
|---|---|
| Visitor | Browse/search published events, view details, register, log in |
| Attendee | Visitor actions plus book, pay, view own bookings/tickets, cancel own free booking, edit own name |
| Organizer | Attendee actions plus create/edit/publish own events, view own event attendees, check in own event tickets |
| Admin | View users/events, grant/revoke organizer access, hide/unhide events, inspect payment exceptions |

Public registration always creates an ATTENDEE. ADMIN comes from a seed or controlled setup, never a public form. An organizer may access only events they own. An admin does not automatically gain access to private ticket codes through public endpoints.

Authorization is enforced on the Express backend for every request. Hiding buttons in React is not access control. Organizer revocation prevents further management but preserves their events and historical bookings; the admin must decide how to handle remaining events.

## 3. Capability map and dependencies

These are modules within one application, not separate services.

| Module ID | Responsibility | Depends on |
|---|---|---|
| identity | Accounts, sessions, roles | — |
| events | Public discovery and organizer event lifecycle | identity |
| bookings | Capacity, free registration, paid reservations | identity, events |
| payments | Checkout and provider-confirmed booking transitions | bookings |
| tickets | Ticket display and organizer check-in | bookings; payments for paid tickets |
| administration | Organizer permissions, event visibility, payment exception review | identity, events, payments |

Build order: identity → events → bookings → payments → tickets, with administration added as its dependencies become available. Connect frontend and backend for each flow as it is built.

## 4. Feature requirements and acceptance criteria

P0 = required for the demo; P1 = only after all P0 checks pass; Later = outside the two-week commitment.

### F01 — Accounts and sessions (P0)

- Register with name, email, password; normalize email and enforce uniqueness.
- Log in/out; restore session after page refresh; edit display name.
- Use a secure password hash and server sessions stored in PostgreSQL; production cookies are HttpOnly, Secure, and appropriately SameSite.
- Forms show field errors and accessible loading/error states; never return password hashes or session secrets.
- Acceptance: duplicate email is rejected, wrong credentials are rejected, logout invalidates the session, and protected API routes reject anonymous users.

### F02 — Public event discovery (P0)

- Home page with upcoming events and link to full catalog.
- Search by title; filters for category, city, date range, and free/paid; paginated results sorted by start time.
- Show title, cover, venue/city, date, price, availability, and organizer name.
- Hidden, draft, and cancelled events do not appear in discovery. Event detail may show a cancelled notice. A hidden event returns an unavailable response to new public visitors, while existing buyers retain their booking record.
- Acceptance: filters combine correctly, empty results are clear, and private attendee/payment data never appears in public responses.

### F03 — Event details (P0)

- Show plain-text description, category, physical location, start/end time, timezone, price/currency, registration deadline, remaining availability, organizer, and relevant restrictions.
- Logged-out booking redirects to login and returns to the event afterward.
- Distinguish free, paid, sold out, registration closed, cancelled, and already booked.
- Acceptance: the server rejects booking when registration is closed even if the user has an old page open.

### F04 — Organizer event management (P0)

- Dashboard listing the organizer's events with status, confirmed tickets, remaining seats, and checked-in count.
- Create draft, edit, publish, and delete an unused draft.
- Required fields: title, description, category, venue name, address, city, timezone, start/end, registration close time, capacity, price, and currency.
- Validate positive integer capacity; nonnegative integer price in minor units; end after start; registration close no later than start; future start at publication.
- Published events with active bookings cannot change buyer-facing terms. Cancellation is a separate action. Display this restriction in the organizer form.
- Acceptance: organizer A cannot edit organizer B's event; invalid dates/capacity/price cannot be saved or published.

### F05 — Free registration and capacity (P0)

- Logged-in attendee obtains one free ticket immediately if capacity remains.
- Repeated clicks or network retries return the existing active booking rather than creating another ticket.
- Attendee can cancel a free booking before event start and before check-in; cancellation restores capacity and invalidates the ticket.
- Rebooking after cancellation creates a new booking and new code; the old code remains invalid.
- Acceptance: for an event with one remaining seat, two concurrent requests can create at most one new confirmed ticket.

### F06 — Paid checkout (P0)

- Backend reserves one seat, snapshots price/currency, and creates provider-hosted sandbox checkout.
- React displays the exact price, test-payment notice, hold expiry, and cancellation limitation before redirecting.
- Reuse the same booking/session on retries while it is open; use provider idempotency for checkout creation.
- A checkout redirect never proves payment. Issue a ticket only after the server verifies the provider's successful payment state, expected amount/currency, and booking reference.
- Failed card attempts can be retried inside the same open checkout. Closing checkout leaves the booking pending until the provider confirms expiry/cancellation or payment success.
- A server-side reconciliation action can retrieve current provider status when the return page still shows pending. It uses the same transition logic as webhooks.
- Acceptance: successful sandbox payment produces one ticket; failure does not produce a ticket; refreshed return pages and duplicate callbacks cannot create another ticket.

### F07 — My bookings and tickets (P0)

- List the attendee's pending, confirmed, cancelled, expired, and refund-exception bookings.
- Booking detail shows event snapshot, payment state, amount, booking ID, and next action.
- Confirmed bookings show a unique unpredictable ticket code, event, attendee name, and check-in status; printable with browser print.
- Pending bookings show resume checkout or refresh status. Cancelled/expired/refund-exception bookings do not expose a valid ticket.
- Acceptance: users cannot view another user's booking/ticket by changing an ID; no ticket is available before confirmation.

### F08 — Attendee management and check-in (P0)

- Organizer views a paginated list of confirmed attendees for their event; search by name or booking ID; filter checked-in/not checked-in.
- Enter the opaque ticket code to check in, or select a confirmed attendee and submit that ticket's code.
- Backend checks ownership, event association, confirmation state, and check-in window. Proposed window: 60 minutes before start through event end.
- Repeated check-in returns “already checked in” with the original timestamp and does not count again.
- Acceptance: wrong-event, expired, cancelled, unpaid, and unknown codes are rejected; simultaneous scans count one attendance.

### F09 — Admin controls (P0)

- Paginated user list; promote ATTENDEE to ORGANIZER and revoke ORGANIZER back to ATTENDEE. No public admin creation or arbitrary role updates.
- Paginated event list; hide/unhide with a reason. Hiding stops new bookings and publishing visibility; it does not cancel sold tickets.
- Existing held payments may settle after hiding because they represent prior reservations; existing buyers retain ticket access.
- View payment exceptions for investigation. Exceptional sandbox refunds happen in the provider dashboard and are reflected through verified provider updates; do not build a general refund UI.
- Acceptance: non-admin access is denied; hiding removes an event from search and blocks new reservations without destroying existing bookings.

### F10 — Operational essentials (P0)

- Responsive layouts, keyboard-operable forms, labelled inputs, readable contrast, useful loading/empty/error states.
- Health/readiness routes, structured request/error logs, safe client errors, seed data, setup instructions, deployed HTTPS demo.
- Seed attendee, organizer, admin, and free/paid/sold-out/closed examples. Seed accounts must be clearly demo-only.
- Acceptance: another teammate can set up the project from README and complete the primary flows.

### Optional and deferred feature inventory

| Priority | Features |
|---|---|
| P1 | QR display using the same opaque ticket code; attendee CSV export with spreadsheet-formula escaping; event image upload if storage is already available |
| Later — account | Email verification, password reset, social login, account deletion workflow |
| Later — ticketing | Multiple ticket tiers, group booking, guest tickets, reserved seating, ticket transfer, waitlists, promotional codes |
| Later — payments | Real-money launch, refund policy and self-service refunds, paid-event cancellation, organizer payouts, platform fees, tax invoices, disputes, settlement reports |
| Later — engagement | Favorites, reviews, reminders, email/SMS tickets, calendar export, recommendations |
| Later — organizer/admin | Staff invitations, approval workflow, recurring events, advanced analytics, audit UI, virtual events, venue maps |

Do not add routes for Later features until their product rules are defined. If schedule slips, cut P1 first and reduce visual polish before weakening payment verification, authorization, or capacity integrity.

## 5. End-to-end user flows

### Free event

Discover → event details → login if needed → register → confirmed booking → view/print ticket → organizer checks in.

### Paid event

Discover → event details → login → create reserved booking → hosted sandbox checkout → return page shows pending → verified webhook/reconciliation confirms payment → view ticket → check-in.

### Organizer

Log in as organizer → create draft → validate details → publish → view sales/attendance → open attendee list → check in attendees.

### Admin

Log in as seeded admin → grant organizer access → inspect catalog → hide inappropriate event with reason → inspect any payment exception.

## 6. Frontend routes — complete P0 inventory

React routes render pages. API routes below are separate backend endpoints.

| Route | Access | Page / behavior |
|---|---|---|
| `/` | Public | Home and upcoming events |
| `/events` | Public | Catalog; URL query parameters retain search/filter/page state |
| `/events/:eventId` | Public | Event details and register/buy action |
| `/register` | Public | Create attendee account |
| `/login` | Public | Login; allowlisted internal return path |
| `/profile` | Signed in | View account and edit name |
| `/my-bookings` | Signed in | Own booking list |
| `/bookings/:bookingId` | Booking owner | Booking state, checkout/resume, free cancellation |
| `/bookings/:bookingId/ticket` | Booking owner | Confirmed ticket and print |
| `/checkout/return` | Signed in | Provider return; use own booking reference, fetch trusted status |
| `/organizer` | Organizer | Own event dashboard |
| `/organizer/events/new` | Organizer | Create draft |
| `/organizer/events/:eventId/edit` | Owning organizer | Edit draft/eligible published event |
| `/organizer/events/:eventId` | Owning organizer | Event summary, publish/cancel/delete actions |
| `/organizer/events/:eventId/attendees` | Owning organizer | Attendee list and manual check-in |
| `/admin` | Admin | Overview/navigation |
| `/admin/users` | Admin | Users and organizer permissions |
| `/admin/events` | Admin | Event visibility management |
| `/admin/payment-issues` | Admin | Payment exceptions and reconciliation status |
| `*` | All | Not-found page |

Reuse forms/components for create/edit; do not duplicate whole pages. Login handles logged-in redirects. Every protected page must also handle an expired session, forbidden response, and missing resource. Configure the host to serve React entry HTML for client routes.

P1 only: QR display fits the existing ticket page; CSV adds an export action to the attendee page; covers fit the existing event form. No extra frontend pages are needed.

## 7. Backend API routes — complete P0 inventory

Base prefix: `/api`. “Owner” is checked against the authenticated user, never a client-supplied user ID.

### Identity

| Method | Route | Access | Input / result |
|---|---|---|---|
| POST | `/api/auth/register` | Public | `{name,email,password}` → attendee and session |
| POST | `/api/auth/login` | Public | `{email,password}` → session and safe user fields |
| POST | `/api/auth/logout` | Signed in | Invalidate session; clear cookie |
| GET | `/api/auth/me` | Signed in | Current user ID, name, email, role |
| PATCH | `/api/users/me` | Signed in | `{name}` → updated profile; reject role/email/password fields |

### Discovery and organizer events

| Method | Route | Access | Input / result |
|---|---|---|---|
| GET | `/api/events` | Public | `q,category,city,from,to,pricing,page,limit` → upcoming visible events |
| GET | `/api/events/:eventId` | Public | Safe event detail; no attendee details |
| GET | `/api/organizer/events` | Organizer | Own events, pagination, aggregate booking/check-in counts |
| POST | `/api/organizer/events` | Organizer | Event fields → new draft; owner from session |
| GET | `/api/organizer/events/:eventId` | Owning organizer | Management detail including draft/hidden state |
| PATCH | `/api/organizer/events/:eventId` | Owning organizer | Allowlisted editable fields; enforce booking/edit restrictions |
| POST | `/api/organizer/events/:eventId/publish` | Owning organizer | Validate draft → published; repeated publish returns current state |
| POST | `/api/organizer/events/:eventId/cancel` | Owning organizer | `{reason}` → cancelled; reject paid event with active holds/tickets |
| DELETE | `/api/organizer/events/:eventId` | Owning organizer | Delete unused draft only; never delete financial/history records |
| GET | `/api/organizer/events/:eventId/attendees` | Owning organizer | `q,checkedIn,page,limit` → minimum attendee fields |

### Bookings, checkout, tickets

| Method | Route | Access | Input / result |
|---|---|---|---|
| POST | `/api/events/:eventId/bookings` | Signed in | No price/role/user ID input; creates free confirmation or paid reservation; returns existing active booking on retry |
| GET | `/api/bookings` | Signed in | Own bookings; optional status filter and pagination |
| GET | `/api/bookings/:bookingId` | Booking owner | Booking/event snapshot and safe payment state |
| POST | `/api/bookings/:bookingId/cancel` | Booking owner | Free confirmed booking before start/check-in only; repeated cancellation is safe |
| POST | `/api/bookings/:bookingId/checkout` | Booking owner | Create/reuse checkout URL for open paid reservation; no client amount accepted |
| POST | `/api/bookings/:bookingId/reconcile` | Booking owner | Rate-limited provider status retrieval; uses shared confirmation/expiry transitions |
| GET | `/api/bookings/:bookingId/ticket` | Booking owner | Confirmed valid ticket only; other states return conflict |
| POST | `/api/organizer/events/:eventId/check-ins` | Owning organizer | `{ticketCode}` → original/new checked-in timestamp |
| POST | `/api/payments/webhook` | Provider signature | Raw provider payload; verify signature, amount, identifiers, and process once |

### Admin and operations

| Method | Route | Access | Input / result |
|---|---|---|---|
| GET | `/api/admin/users` | Admin | `q,role,page,limit` → safe user list |
| PATCH | `/api/admin/users/:userId/role` | Admin | `{role: ATTENDEE or ORGANIZER}`; cannot modify ADMIN |
| GET | `/api/admin/events` | Admin | `q,status,hidden,page,limit` → moderation list |
| PATCH | `/api/admin/events/:eventId/visibility` | Admin | `{hidden,reason}`; record actor/reason/time |
| GET | `/api/admin/payment-issues` | Admin | Paginated unresolved provider/booking mismatches |
| POST | `/api/admin/bookings/:bookingId/reconcile` | Admin | Reconcile exceptional payment/refund against provider; never mark paid from input |
| GET | `/api/health` | Public | Process liveness; no secrets |
| GET | `/api/ready` | Public | Database readiness; generic 200/503 only |

P1 endpoints, only if built:

- `GET /api/organizer/events/:eventId/attendees/export` — owning organizer, CSV export.
- `POST /api/organizer/uploads` — organizer, constrained image upload after choosing storage; validate file type/size and storage permissions.

## 8. API contract and validation

- Single-item success: `{ "data": { ... } }`; list success: `{ "data": [...], "pagination": { "page": 1, "limit": 20, "total": 42 } }`.
- Error: `{ "error": { "code": "EVENT_SOLD_OUT", "message": "This event is sold out.", "fields": {} } }`.
- Use 201 for creation, 200 for retrieval/update/reused resource, 204 for delete/logout, 400 for invalid input, 401 for missing/expired session, 403 for role denial, 404 for missing or inaccessible private resources, 409 for state/capacity conflict, 429 for throttling, and 503 for provider unavailability. Internal errors return safe 500 responses.
- Proposed stable business codes: `EVENT_SOLD_OUT`, `REGISTRATION_CLOSED`, `EVENT_UNAVAILABLE`, `BOOKING_NOT_CONFIRMED`, `EVENT_EDIT_LOCKED`, `PAID_CANCELLATION_UNSUPPORTED`, `PAYMENT_PENDING`, `PAYMENT_REVIEW_REQUIRED`.
- Pagination defaults to 20, maximum 100; cap search length; validate IDs, enums, date bounds, string lengths, and request sizes. Proposed text limits: name 100, title 150, description 5,000 characters.
- Dates use ISO 8601 UTC in APIs/storage, with event IANA timezone saved for display and organizer input conversion. Do not interpret a datetime-local value as UTC without conversion.
- Prices are integer minor units with a currency code, never floating-point amounts. The backend loads price/currency from the event and preserves them on the booking.
- Plain text event descriptions; no user-supplied HTML. Prisma parameterized queries; raw SQL locks use bound parameters.
- State-changing cookie requests require CSRF protection/origin validation. Same-origin deployment is preferred; if separate origins are used, allow only the configured frontend origin and configure cookies deliberately.
- Apply rate limits to login/register, booking/checkout, reconciliation, and ticket-code lookup. Redact passwords, cookies, payment credentials, and ticket codes from logs.

## 9. Suggested database model

This is a logical design for review, not an existing Prisma schema. Keep one PostgreSQL database and one Express application.

| Entity | Essential fields and constraints |
|---|---|
| User | ID, name, normalized unique email, passwordHash, role, createdAt, updatedAt |
| Session | Session ID/token representation, user/session data, expiry; use the chosen session store's schema |
| Event | ID, organizerId FK, title, description, category, coverKey, venue, address, city, timezone, startAt, endAt, registrationClosesAt, capacity, priceMinor, currency, status, hiddenAt, moderationReason, moderatedById, createdAt, updatedAt |
| Booking | ID, userId FK, eventId FK, status, amountMinor, currency, event snapshot, holdExpiresAt, unique nullable ticketCode, checkedInAt, cancelledAt, createdAt, updatedAt |
| Payment | ID, unique bookingId FK, provider, unique nullable providerCheckoutId, unique nullable providerPaymentId, status, amountMinor, currency, refundReference, lastErrorCode, timestamps |
| ProcessedWebhook | Unique provider event ID plus provider, processedAt; insert atomically with corresponding state updates |

No separate Ticket table is needed for one ticket per booking. A booking's code and checkedInAt cover the MVP. If multi-ticket orders are introduced, add order/ticket separation then.

Enforce one active booking per `(userId,eventId)` using a PostgreSQL partial unique index for pending/confirmed states, created in a migration if Prisma cannot express the index. Inactive historical bookings remain for rebooking and accounting. Event and booking foreign keys must restrict destructive deletion of referenced data.

Add indexes for event discovery `(status,startAt)`, organizer events `(organizerId,createdAt)`, attendee bookings `(userId,createdAt)`, event bookings `(eventId,status)`, and payment exception/status lookup. Unique provider references and ticket codes also provide lookup indexes. No full-text service is needed for the demo dataset.

### Event states

`DRAFT → PUBLISHED → CANCELLED`. A past event is shown as ended based on time; no scheduled job is required. `hiddenAt` is a moderation flag independent of lifecycle. Hidden events cannot be republished to bypass moderation.

### Booking and payment states

- Free: creation → `CONFIRMED`; eligible cancellation → `CANCELLED`.
- Paid: creation → `PENDING_PAYMENT`; verified settled payment → `CONFIRMED`; verified unpaid expiry → `EXPIRED`.
- Unexpected captured payment for an invalid/released booking → `REFUND_REQUIRED`; verified provider refund → `REFUNDED`. No ticket is issued in either state.
- Payment records distinguish open checkout, paid, expired, refund-required, and refunded. An individual declined card attempt does not expire a still-open checkout.
- Check-in is a timestamp on a confirmed booking. It does not create an extra booking state.

## 10. Capacity, payment reliability, and failure paths

### Capacity invariant

`confirmed bookings + pending reservations that have not been safely released <= event capacity`.

Use a short database transaction that locks the event row, rechecks event/deadline/visibility, checks existing active booking, counts occupied capacity, and inserts the booking. All capacity-changing paths—including cancellation, reservation release, and conflicting event edits—must use the same event lock discipline. Count inside the transaction; a frontend availability number is only informational. Do not introduce a Redis lock.

### Reservation expiry

Choose a provider-supported checkout timeout on Day 1. `holdExpiresAt` matches that provider session's expiry. Reaching the local clock deadline alone must not release a reservation while payment could still settle. Verified expiry/reconciliation confirms unpaid status before releasing the seat. This may temporarily understate availability when callbacks are delayed, but must not oversell.

### External provider calls

Create the local reservation in a short transaction, call the provider outside that transaction, and save the provider reference using conditional updates. Use a stable idempotency key derived from the booking ID. If the provider request times out, retry/reconcile the same booking instead of assuming it failed and creating a second checkout. Define recovery for an orphaned reservation whose session creation never completed; do not leave seats held indefinitely.

### Webhook/reconciliation transitions

Verify the provider signature on the required raw request body; with Express, register the raw-body webhook handling before middleware that would transform that body. Reject invalid signatures. Validate the booking reference, payment identifier, amount, currency, and provider's settled state.

Commit webhook deduplication and booking/payment changes together. A crash before commit remains retryable; do not record an event as processed before its effects are durable. Duplicate and out-of-order messages cannot downgrade a confirmed payment or issue duplicate tickets. Acknowledge only after a small durable update succeeds; return a retryable error on database failure. Reconciliation invokes the same state transition logic.

The browser return page fetches status and may request reconciliation; it never writes `paid=true`. Expired/released bookings never regain capacity automatically from a late payment. Record the exception for refund investigation.

### Cancellation and visibility

Cancelling a free event invalidates its tickets and blocks booking/check-in; perform this consistently with the event lifecycle update. Paid events with any confirmed tickets or active reservations cannot be cancelled in this MVP. Hiding an event stops new reservations but preserves existing ticket rights and payment reconciliation.

Provider documentation supports hosted checkout, server-driven fulfillment, signed webhooks, and sandbox payment testing. Stripe is used here as a reference, not as an approved provider choice: [hosted checkout](https://docs.stripe.com/payments/checkout/quickstarts), [fulfillment](https://docs.stripe.com/checkout/fulfillment), [webhooks](https://docs.stripe.com/webhooks), [sandbox testing](https://docs.stripe.com/testing). The final integration must follow the selected provider's official documentation.

## 11. Architecture and engineering conventions

- React client; Node/Express API; Prisma for database access/migrations; PostgreSQL for application and session data.
- One repository with proposed `client/`, `server/`, `server/prisma/`, and this PRD. No services, queues, Redis, or shared-package scaffolding.
- Choose JavaScript or TypeScript consistently on Day 1; TypeScript is recommended if the whole team can already use it. Do not spend the deadline learning it.
- Route handlers validate/authenticate and call focused domain logic where shared behavior exists. Share booking transitions between webhook and reconciliation; do not create generic repositories or factories.
- A minimal frontend API client handles cookies and the agreed error envelope. Use a consistent query/loading approach; avoid two competing state libraries.
- Reuse one Prisma client per server process; set a deployment-appropriate database connection limit. No database client creation per request.
- Person 1 coordinates migrations; teammates submit model changes rather than concurrently editing migration history. Never reset shared or deployed data to fix a migration conflict.
- README documents environment variables, dev/build/test commands, migration/seed commands, demo credentials, webhook setup, and deployment.
- No runnable commands exist yet because the workspace is empty. At setup, establish `npm run dev`, `npm run build`, `npm run lint`, and `npm test` in the relevant folders; document migration/seed scripts explicitly. Do not claim these commands work until scaffolded and verified.

## 12. Work allocation — exactly four people

Assign names to these roles on Day 1. Backend/frontend owners work together on complete user flows; integration is daily, not a final-day task.

| Person | Primary ownership | Supporting responsibility |
|---|---|---|
| Person 1 — identity and database | Express setup, Prisma migrations, sessions, authorization, event-management APIs | Deployment configuration, migrations review, security checks |
| Person 2 — attendee frontend | React setup, accounts UI, discovery, event detail, bookings/tickets UI | Responsive layout, accessibility, frontend build and routing |
| Person 3 — bookings and payments | Booking transactions, sandbox checkout, webhook/reconciliation, ticket/check-in APIs | Capacity/payment integration tests, provider setup |
| Person 4 — organizer/admin frontend and QA | Organizer forms/dashboard, attendee/check-in UI, admin UI; small admin APIs coordinated with Person 1 | Acceptance checklist, integration testing, README/demo preparation |

### Each person's ordered checklist

**Person 1**

1. Set up Express, PostgreSQL connection, Prisma, error envelope, health routes; agree API contracts with everyone.
2. Create user/session schema and register/login/logout/me; secure role checks; seed roles.
3. Add event schema with Person 3's booking constraints; implement event create/read/edit/publish/delete and discovery queries.
4. Implement cancellation/visibility restrictions using the shared event transaction rules; coordinate admin role APIs with Person 4.
5. Review ownership checks, migration correctness, CSRF/origin rules, secret handling, and deployed session behavior.
6. Apply reviewed migrations to demo deployment; support integration fixes and document setup.

**Person 2**

1. Set up React router, layout, API client, basic styles, loading/errors, and protected-route behavior.
2. Build register/login/profile and connect to Person 1's real APIs.
3. Build home/catalog/filter URL state/event detail and connect to event APIs.
4. Build free registration, own booking list/detail, cancellation, and ticket page with Person 3.
5. Add paid checkout/resume/return/pending/error UI; display sandbox and policy notices.
6. Verify mobile, keyboard, refresh/deep links, session expiry, print layout, and production build.

**Person 3**

1. Establish the provider sandbox and callback reachability on Day 1; agree payment states, hold duration, and request/response shapes.
2. Implement transactional free booking, duplicate protection, cancellation, and concurrent-capacity test.
3. Implement paid reservations, idempotent provider checkout creation, and timeout recovery.
4. Implement verified webhooks and reconciliation with deduplication, expiry handling, and exception recording.
5. Implement own booking/ticket endpoints and atomic organizer check-in; work with Persons 2 and 4 on UI integration.
6. Run provider success/failure/expiry/replay tests and capacity race checks; fix money/seat-integrity failures first.

**Person 4**

1. Define organizer/admin screens using the agreed API contracts; prepare the shared acceptance checklist and demo scenarios.
2. Build organizer dashboard and reusable event form; connect create/edit/publish flows to Person 1's APIs.
3. Build attendee list and code check-in screen against Person 3's APIs.
4. Build admin users/events/payment-issue screens and their limited admin endpoints with Person 1's authorization review.
5. Test complete flows across roles and browsers; file reproducible issues with expected/actual behavior.
6. Finish README, demo data, presentation/screenshots, and release checklist; help fix integration bugs.

## 13. Fourteen-day execution schedule

Day numbers are relative to team kickoff. This is a target schedule, not a guarantee; available hours and existing experience determine feasibility.

| Days | Person 1 | Person 2 | Person 3 | Person 4 | Exit checkpoint |
|---|---|---|---|---|---|
| 1 | API/DB setup; initial schema | React/router/API client | Sandbox account and payment proof-of-connection | Screen outline, acceptance checklist | Agree defaults/provider/currency/language; all run both apps; create initial deployment |
| 2–3 | Auth, sessions, ownership; event schema | Register/login/profile; catalog shell | Free booking transaction and race test | Organizer dashboard/form shell | Register → login → session refresh works end-to-end |
| 4–5 | Event CRUD/publish/discovery | Catalog/detail linked to API | Free booking/cancel/ticket endpoints | Create/edit/publish linked to API | Create published event → discover → free ticket works |
| 6–7 | Editing/cancellation constraints; admin support | Bookings/ticket/print UI | Paid reservation + checkout + signed webhook | Attendee/check-in UI | Paid sandbox success confirms exactly one booking; failure issues none |
| 8–9 | Admin permissions/visibility review | Checkout return/resume/reconciliation states | Expiry/replay/reconciliation + check-in | Admin screens and endpoints | Both ticket types check in once; hidden event blocks new booking |
| 10 | Backend integration/security fixes | Frontend integration/accessibility | Capacity/payment exception tests | Cross-role full-flow test | All P0 connected; feature freeze |
| 11–12 | Migration/deployment fixes | Mobile/deep-link/session fixes | Callback and provider-recovery fixes | Regression testing and README | Deployed HTTPS flows pass; critical issues resolved |
| 13 | Final setup verification | Demo UI cleanup | Sandbox/demo payment validation | Seed data, presentation, rehearsal | A teammate runs setup independently; full demo rehearsal |
| 14 | Release support | Release support | Release support | Final checklist and demo | Buffer, final regression, project submission |

If the team has only evenings or is new to this stack, reduce optional polish and admin overview statistics. Keep the paid-flow security and concurrency checks. If provider access is blocked, present paid checkout as incomplete rather than using a fake “payment successful” button.

### Coordination rules

- Short daily check-in: finished flow, current blocker, next deliverable; merge small reviewed changes daily.
- Agree request bodies and sample responses before the frontend depends on them. Temporary mock data must be clearly marked and removed before the feature checkpoint.
- Person 1 owns migration sequencing; Person 3 owns payment/booking state changes; Person 2 owns React routing/API-client changes. Coordinate edits to these shared files.
- Each feature author verifies their feature; Person 4 coordinates QA but is not the only tester.
- No P1 work until free and paid flows, authorization, and capacity tests pass on the deployed app.

## 14. Verification plan and definition of done

Use the team's selected test runner; run backend integration checks against real PostgreSQL because capacity/uniqueness behavior cannot be proven with an in-memory mock. Automate critical paths; manually verify visual layout and provider dashboard outcomes.

| Check | Required result |
|---|---|
| Register/login/logout | Unique normalized email, valid session, logout invalidation, safe errors |
| Role escalation | Registration/profile cannot assign organizer/admin; admin-only role route rejects other actors |
| Ownership/ID tampering | Other users' bookings and organizers' events cannot be read/changed |
| Event validation | Invalid date ranges/price/capacity/deadline rejected; live terms locked after bookings |
| Free booking/retry | One active booking/code; cancellation restores capacity and invalidates old code |
| Last-seat race | For capacity 1 and two simultaneous attendees, only one active reservation/confirmation exists |
| Paid success | Verified matching sandbox payment creates exactly one valid ticket |
| Paid failure/return tampering | Failed payment and forged success URL never issue a ticket |
| Webhook signature/replay | Invalid signature rejected; repeated event has no duplicate side effects |
| Out-of-order callbacks | Old expiry/failure cannot downgrade confirmed payment; late invalid payment becomes exception |
| Checkout timeout/retry | Provider timeout does not create duplicate charge/session or prematurely free a potentially paid seat |
| Expiry/reconciliation | Verified unpaid expiry releases capacity; pending bookings recover when callback is delayed |
| Check-in race | Wrong-event/unpaid/cancelled code denied; repeated/concurrent valid check-in counted once |
| Cancellation/moderation | Free event cancellation invalidates tickets; paid active-event cancellation blocked; hiding preserves existing tickets |
| Data exposure | Public APIs/logs do not leak passwords, cookies, ticket codes, or payment credentials |
| Deployment | HTTPS, secure sessions, correct callback URL, client deep links, migrations, readiness, secret configuration |
| UX | Mobile layout, keyboard forms, useful errors/empty states, printable ticket |

Definition of done for each feature: acceptance criteria pass; frontend and backend are integrated; error paths handled; relevant checks pass; another teammate reviews; README/API examples updated if needed. Final release requires a clean build and lint/type checks if configured, no known critical authorization/payment/capacity failures, and a rehearsed demo.

### Nonfunctional targets

- Bound list sizes and avoid one database query per event/card; return aggregates in bounded queries.
- Proposed performance target: on a seeded 1,000-event dataset with 10 concurrent catalog clients, p95 catalog API response below 1 second in a documented deployment environment. Treat this as a measured target, not an unverified scalability claim.
- Keep database transactions short and provider HTTP requests outside locks. Provider requests have explicit timeouts and bounded retries only where idempotent.
- Browser refresh, interrupted checkout, server restart, and provider callback retries must preserve booking/payment records.
- Never commit secrets; use environment configuration and safe demo data. Record error/request/booking references for diagnosis without sensitive payloads.

## 15. Final demo script

1. Organizer logs in and publishes one free and one paid event.
2. Visitor filters the catalog and opens the free event.
3. Attendee registers/logs in, books the free event, views/prints the ticket.
4. Attendee buys the paid event through provider sandbox; show verified confirmation and its ticket.
5. Demonstrate declined sandbox payment produces no ticket.
6. Organizer checks in a valid ticket and repeats the action to show duplicate protection.
7. Admin grants organizer access and hides an event; confirm it disappears from public discovery.
8. Show last-seat concurrency and webhook replay test results.

## 16. Decisions to close at kickoff

- Confirm sandbox-only delivery versus real payments. This draft budgets for sandbox.
- Choose payment provider, supported currency, and provider-supported hold duration.
- Confirm one-ticket/one-price restriction, free-only attendee cancellation, and published-edit restrictions.
- Assign team names to Persons 1–4; state daily available hours and deployment account ownership.
- Choose JavaScript or TypeScript based on existing team competence.

After these decisions, update this same document and start with Day 1 setup. This PRD does not authorize a real-money launch or imply its currently unimplemented behavior has been tested.
