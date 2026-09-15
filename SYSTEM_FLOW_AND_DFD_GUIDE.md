# KATALA FIRE PROTECTION — SYSTEM FLOW DOCUMENT (DFD REFERENCE)

Prepared: September 14, 2026
Purpose: Complete data-flow map of the Katala online quotation & service system,
ready for drawing a DFD (Data Flow Diagram). Export to Word/PDF/Draw.io as needed.

================================================================================
1. SYSTEM CONTEXT (LEVEL-0 OVERVIEW)
================================================================================

TECHNOLOGY STACK
  - Frontend  : React 19 SPA + Vite (dev server: http://localhost:5173)
                Hash-based routing (#home, #products, #services, #profile,
                #admin, #staff-*, #signin, #signup)
  - Backend   : Single Node.js ESM API server, src/server.js (~4,216 lines)
                Local-server on http://localhost:3001 (PORT=3001)
                Router: dispatchRoute() -> if/else on method + URL path regex
  - Database  : MySQL "db_katala" on XAMPP (localhost:3306)
                Server auto-translates PostgreSQL SQL syntax to MySQL
  - Auth      : Local provider (AUTH_PROVIDER=local), JWT Bearer tokens,
                roles: customer | staff | admin
  - Payments  : Xendit (product quotations - hosted checkout),
                Mock payment (service requests), PayMongo (defined but unused)
  - Client side-channel : browser localStorage + sessionStorage

EXTERNAL ENTITIES (for the context DFD)
  E1  CUSTOMER ........ private individual / company requesting quotes
  E2  STAFF ........... Katala employee handling requests (portal)
  E3  ADMIN ........... system administrator (portal)
  E4  PAYMENT GATEWAY . Xendit (hosted checkout page + webhook callbacks)
  E5  SYSTEM CLOCK / TRIGGERS ... internal events (webhook callbacks,
                                  staff actions) - represented as triggers

DATA STORES (MySQL, schema: katala-website/database/katala_xampp_mysql_schema.sql)
  D1  IDENTITY      tbl_role, tbl_user, local_auth_accounts, tbl_userrole,
                    tbl_useraddress
  D2  PRODUCTS      tbl_productcategory, tbl_product, tbl_productvariant
                    (material variants = the "Materials" SKU catalog)
  D3  SERVICES      tbl_servicecategory, tbl_service
  D4  QUOTATIONS    tbl_quotation, tbl_quotationproductitem,
                    tbl_quotationserviceitem, tbl_quotationstatushistory
  D5  SERVICE REQ   tbl_servicerequest, tbl_servicerequeststatushistory
  D6  PAYMENTS      tbl_paymenttransaction (holds Xendit/PayMongo/mock payments,
                    receipt number, paid-at timestamp)
  D7  SCHEDULE      tbl_appointment, tbl_serviceassignment (staff assignment)
  D8  NOTIFICATION  tbl_notification, tbl_attachment
  D9  CLIENT STORE  browser localStorage/sessionStorage (see section 5)

Migrated/active schema tables only. Legacy tables in db_katala.sql (root) and
tbl_project/tbl_projectMaterial/tbl_projectBilling in the XAMPP schema are NOT
used by the running API.

================================================================================
2. ROLE MODEL & AUTHENTICATION
================================================================================

ROLES: customer (default), staff, admin
  - Admin can access Admin portal AND Staff portal (admin inherits staff pages)
  - Staff cannot access Admin pages
  - Sign-in is portal-scoped: { portal: customer | staff | admin } + email + password

AUTH MECHANISM
  1) POST /api/auth/signup       - create account (2-step form on page_signup)
       * Normalized PH mobile: +63...
       * Output flags: requiresEmailConfirmation | requiresApproval (staff)
       * Staff signups require admin approval before they can sign in
  2) POST /api/auth/signin       - verify credentials -> issue JWT
       response { access_token, expires_at, user{id,email,role,...} }
  3) Client stores snapshot in localStorage key "katala-auth-v2"
     (JWT not re-persisted after reload bundle builds; expiry checked client-side)
  4) Every API call attaches:  Authorization: Bearer <JWT>
     (dev fallback: X-Development-User-Id header from VITE_DEMO_USER_ID)
  5) Server guards:
       requireCustomer()      -> /api/quotations*, /api/service-requests*,
                                  /api/customer/inbox
       requirePortalUser()    -> /api/auth/portal-session, /api/staff/*,
                                  /api/admin/*
  6) 401 response clears the client session and redirects to #signin

================================================================================
3. BUSINESS PROCESSES (LEVEL-1 DFD PROCESS LIST)
================================================================================

P1.0  ACCOUNT & IDENTITY  (server.js)
      - register profile  POST /api/auth/register-profile
      - signup            POST /api/auth/signup        (handleLocalSignup:564)
      - signin            POST /api/auth/signin        (handleLocalSignin:628)
      - session           GET  /api/auth/session       (handleSession:700)
      - portal session    GET  /api/auth/portal-session(handlePortalSession:730)
      - update profile    PATCH /api/auth/profile      (handleUpdateOwnProfile:745)
      - admin account mgmt (part of P8.0)

P2.0  CATALOG PUBLISH
      - product/material list  GET /api/catalog/materials (active only)
      - service list           GET /api/catalog/services  (active only)

P3.0  PRODUCT QUOTATION LIFECYCLE (customer + staff + payment)
      - create       POST   /api/quotations          (handleCreateQuotation:1879)
      - get          GET    /api/quotations/:ref     (handleGetQuotation:1997)
      - update/edit  PATCH  /api/quotations/:ref     (handleUpdateQuotation:2003;
                      only while status = Submitted)
      - cancel       DELETE /api/quotations/:ref     (handleCancelQuotation:2045;
                      allowed only in Submitted / Under Review)
      - confirm      POST   /api/quotations/:ref/confirm (handleConfirmQuotation:2547;
                      payable status -> Customer Confirmed)
      - staff update PATCH  /api/staff/quotations/:ref      (handleStaffUpdateQuotation:3511)

P4.0  SERVICE REQUEST LIFECYCLE
      - create       POST   /api/service-requests                (:2929)
      - get          GET    /api/service-requests/:ref           (:3160)
      - update       PATCH  /api/service-requests/:ref           (:3166)
                      (only while Submitted/Under Review/awaiting confirmation)
      - cancel       DELETE /api/service-requests/:ref           (:3224)
                      (blocked when Completed/Rejected/Cancelled)
      - confirm      POST   /api/service-requests/:ref/confirm   (:3079)
      - staff update PATCH  /api/staff/service-requests/:ref     (:3731)

P5.0  STAFF WORKFLOW & OPERATIONS
      - work queue   GET    /api/staff/work-queue  (handleStaffWorkQueue:3444)
                      returns: quotations (kind "Quotation") + service requests
                      (kind "Service"), each with customer, status, schedule,
                      charges/totals, payment, recurrence, description.
      - staff roster GET    /api/staff/members  (handleListStaffMembers:1025)
      - quotation update: status, additionalCost (derived from charges),
        quotationDate, validUntil, schedule{date,time,staff}, completedAt,
        product prices, status-history + optional tbl_notification write
        (notifyCustomer flag default true)
      - service update: status, quotedAmount, charges, preferred date/time,
        recurrenceFrequency, notifyCustomer
      Client-side overlay: localStorage "katala-staff-workflows-v1" stores a
      local status/schedule overlay (event katala-workflow-changed) used for
      display and recurring-visit bookkeeping (visits[], maintenanceClosed)

P6.0  PAYMENT & RECEIPTS
      - product:  POST /api/quotations/:ref/xendit-checkout (handle:2278)
                  -> create Xendit Payment Session (POST https://api.xendit.co/sessions,
                     mode PAYMENT_LINK, allow_all_or_selected_channels) ->
                  -> return { checkoutUrl: payment_link_url } -> client redirects
      - product:  POST /api/quotations/:ref/paymongo-checkout (handle:2407, unused by UI)
      - product:  POST /api/quotations/:ref/mock-payment     (handle:2574, unused by UI)
      - service:  POST /api/service-requests/:ref/mock-payment (handle:3111)
                  service requests use MOCK payment (no real charge)
      - receipts: GET  /api/payments/:ref/receipt            (handleGetReceipt:2875)
      - webhooks: POST /api/xendit/webhook   (handleXenditWebhook:2913)
                  POST /api/paymongo/webhook (handlePaymongoWebhook:2897)
      Payment transaction statuses stored in tbl_paymenttransaction:
                  Pending -> Paid (with receipt# + paidAt) | Cancelled | Expired
      On Paid, the parent quotation/service request status is set to "Paid".

P7.0  CUSTOMER INBOX & NOTIFICATIONS
      - GET /api/customer/inbox (handleCustomerInbox:3257)
          returns up to 50 quotations, 50 service requests + notifications[]
      - tbl_notification rows created by staff updates (see P5.0) and read here.

P8.0  ADMIN MANAGEMENT
      - dashboard   GET    /api/admin/dashboard     (handleAdminDashboard:969)
                    metrics: managedAccounts, materialSkus, activeServices,
                    paidPayments + recentActivity[] (quote/service events)
      - accounts    GET    /api/admin/accounts      (:965)
                    PATCH  /api/admin/accounts/:userId (:1042)
                    (role/status change, approve staff, staff assignment fields)
      - materials   GET/POST/PATCH/DELETE /api/admin/materials & .../:variantId
                    (:3804,:3855,:3912)  - catalog + stock + price min/max
      - services    GET/POST/PATCH/DELETE /api/admin/services & .../:serviceId
                    (:3929,:3962,:3996)
      - backup      GET    /api/admin/database-backup (:1135) -> CSV download
      - password change: NOT implemented (local MySQL auth). UI shows stub error.

P9.0  CLIENT-SIDE PROCESSES (React components; no server calls)
      - Cart (localStorage "katala-cart-v3") + checkout form (page_products)
      - Saved quotation refs (localStorage "katala-quotation-refs-v1", max 10)
      - Staff chat (MessagesPage + ChatPanel): hardcoded demo threads, no API
      - Website_Management admin page: static placeholder (no API)
      - Global search within Staff & Admin panels: client-side filter only
      - StaffSettings/Admin System Settings: profile update + local prefs
        (katala-staff-settings / katala-admin-settings / katala-admin-theme)

================================================================================
4. STATUS STATE MACHINES (important for the DFD)
================================================================================

QUOTATION (tbl_quotation.v_quotationstatus)
   Storage statuses used by the API:
     Submitted  (customer submits)
       -> Customer edits allowed here only (PATCH /api/quotations/:ref)
       -> Customer CANCELS allowed here (DELETE)
       -> Staff review: saved with status "Submitted" until ready
     Accepted / Approved / "Ready for Payment" / "For payment"  (staff prices it)
       -> gate: isPayableQuotationStatus(); total must be > 0
     Customer Confirmed  (POST /api/quotations/:ref/confirm)
     Paid  (payment webhook or mock -> tbl_paymenttransaction = Paid)
     Scheduled (staff assigns date+time+staff on quotation)
     In Progress / Completed (staff marks; completedAt = NOW())
     Cancelled (customer cancel, or gateway cancel)
   Status HISTORY -> tbl_quotationstatushistory (every transition recorded)
   PAYABLE SET: Accepted, Approved, Ready for Payment, For payment,
                Customer Confirmed

SERVICE REQUEST (tbl_servicerequest.v_requeststatus)
     Submitted (customer)
       -> customer edits allowed (Submitted/Under Review/Awaiting confirmation)
     Under Review / Awaiting Customer Confirmation  (staff)
     Accepted / Approved / Ready for payment / For payment (staff quotes amount;
       v_quotedamount > 0 required for confirm/pay)
     Customer Confirmed  (:3079)
     Paid  (mock service payment -> paymentstatus=Paid, receipt#)
     Scheduled / In Progress / Completed  (staff ops)
     Cancelled / Rejected  (terminal; cannot be edited/cancelled by customer)
   CLIENT WORKFLOW VOCABULARY (staffWorkflow.js, overlay only):
     Submitted -> Under Review -> Quotation Draft -> Ready for Payment ->
     Customer Confirmed -> Paid -> Scheduled -> In Progress -> Completed
     + Cancelled. Recurring maintenance: Completed auto-rolls to Scheduled
     with next date and a visits[] entry, unless maintenanceClosed=true.

QUOTATION TOTAL = SUM(charges) + addition/adjustment, discount field, notes,
terms; paid payment derives receipt number (RCT-...) and paidAt.

================================================================================
5. CLIENT-SIDE DATA STORES (Level-1 data store D9)
================================================================================
  localStorage
    katala-auth-v2 ............ session snapshot {token, expiresAt, user}
    katala-auth-v1 ............ legacy (removed on signout)
    katala-cart-v3 ............ product cart items (products page)
    katala-quotation-refs-v1 .. saved quotation reference numbers (max 10)
    katala-staff-workflows-v1 . staff local status/schedule overlay + recurring
                               visits (event katala-workflow-changed)
    katala-staff-settings ..... staff email/push notification prefs
    katala-admin-settings ..... admin notification prefs
    katala-admin-theme ........ light/dark theme (admin + staff)
  sessionStorage
    katala-return-after-auth .. target route after sign-in
    katala-signin-email ....... email prefill after signup
    katala-pending-service .... pre-select a service request after login
    katala-login-in-progress .. sign-in guard flag

================================================================================
6. END-TO-END DATA FLOWS (step-by-step, with arrows)
================================================================================

FLOW A - ACCOUNT CREATION & LOGIN
  Customer -> (signup form: names, email, mobile, password, company info)
           -> client validation -> POST /api/auth/signup -> P1.0
           -> writes D1 (user + role + credential) -> response flags
  Customer -> (signin form: email+password+portal) -> POST /api/auth/signin
           -> P1.0 reads D1 -> returns JWT -> client saves D9(katala-auth-v2)
           -> redirect to role home (#profile / #admin / #staff-work-queue)

FLOW B - PRODUCT QUOTATION (full lifecycle)
  Customer  -> Products page -> GET /api/catalog/materials  -> P2.0 reads D2
  Customer  -> cart (D9 katala-cart-v3) -> Request Quotation form (project
              name/establishment/address/description/remarks)
            -> POST /api/quotations -> P3.0 (validates variants+stock) writes
              D4 (quotation Submitted + items + history)
  Staff     -> Work Queue -> GET /api/staff/work-queue (P5.0 reads D4+D5)
            -> open quotation -> build charges (material prices from D2)
            -> PATCH /api/staff/quotations/:ref -> P3.0/5.0 writes D4 (status
              Accepted + quote date/validity/charges) + history + D8
              notification (notifyCustomer default true)
  Customer  -> Profile inbox -> GET /api/customer/inbox (P7.0 reads D4)
            -> Confirm -> POST /api/quotations/:ref/confirm -> writes D4
              (Customer Confirmed)
  Customer  -> Pay -> POST /api/quotations/:ref/xendit-checkout -> P6.0 writes
              D6 (Pending payment) -> Xendit Session -> redirect to E4 hosted
              checkout
  E4 Xendit -> customer pays -> webhook POST /api/xendit/webhook
            -> P6.0 (verify x-callback-token, payment_session.* event)
            -> writes D6 (Paid, receipt#, paidAt) -> writes D4 (quotation Paid)
  Staff     -> Paid Assignments page (filters queue status=Paid) -> assign
              date/time/staff -> PATCH /api/staff/quotations/:ref -> D4
              (Scheduled) + notification
  Staff     -> Service Calendar -> Visit done -> status Completed -> D4.
  Customer  -> Profile inbox shows Paid/Scheduled/Completed + receipt
            -> GET /api/payments/:ref/receipt -> P6.0 reads D6.

FLOW C - SERVICE REQUEST (incl. recurring maintenance)
  Customer  -> Services page -> GET /api/catalog/services (P2.0 reads D3)
            -> Request form (service, problem, address, preferred date/time,
              recurrence frequency, priority, remarks)
            -> POST /api/service-requests -> P4.0 writes D5 (Submitted+history)
  Staff     -> Work Queue -> PATCH /api/staff/service-requests/:ref -> P4.0/5.0
              writes D5 (status/quote, quotedAmount, schedule) + D8 notify
  Customer  -> Confirm -> POST .../confirm (P4.0, needs quotedAmount>0)
            -> Pay (MOCK) -> POST .../mock-payment -> P6.0 writes D5+D6 Paid
  Staff     -> Paid/Maintenance/Calendar pages -> schedule + assign staff
              (D7 tbl_appointment / tbl_serviceassignment + D5)
            -> Visit done -> Completed; recurring -> auto next schedule in D9
              overlay (visits[]) with maintenanceClosed toggle.
  Customer  -> Inbox + receipts reflect full lifecycle.

FLOW D - ADMIN MANAGEMENT
  Admin -> Accounts page -> GET /api/admin/accounts -> P8.0 reads D1
        -> approve staff / change role/status -> PATCH /api/admin/accounts/:id
           -> writes D1
  Admin -> Materials page -> CRUD /api/admin/materials -> writes/reads D2
        -> Services page -> CRUD /api/admin/services -> writes/reads D3
  Admin -> Dashboard -> GET /api/admin/dashboard -> reads D1,D2,D3,D6,D4,D5
        -> recent activity (quotations/service requests)
  Admin -> Quotation Requests page -> GET /api/staff/work-queue
        -> read-only review (status progression done by Staff)

FLOW E - PAYMENT GATEWAY INTERACTION (external entity detail)
  Our server -> POST https://api.xendit.co/sessions
     body : session_type=PAY, mode=PAYMENT_LINK, amount, currency=PHP,
            country=PH, customer{reference_id,email,...}, items,
            allowed_payment_channels (array, from env XENDIT_PAYMENT_CHANNELS),
            success_return_url / cancel_return_url (HTTPS only),
            description, metadata
  Xendit  -> response { payment_link_url } -> our server -> client redirect
  Customer-> pays on hosted checkout (GCASH/PAYMAYA/QRPH/CARDS per config)
  Xendit  -> webhook POST /api/xendit/webhook (header x-callback-token =
             XENDIT_WEBHOOK_TOKEN) -> verify -> map payment_session event
             (COMPLETED/SUCCEEDED->Paid, CANCELED->Cancelled, else Pending)
           -> update D6 + parent quotation status.

CROSS-CUTTING NOTES (known gaps vs. DFD "ideal" flows)
  - Staff Messages/Chat is a hardcoded UI demo (no API, no persistence).
  - Website_Management admin page is a static placeholder (no API).
  - Service payment is MOCK (no real gateway charge).
  - PayMongo endpoints exist server-side but no UI calls them.
  - Email verification + staff approval are state flags; no real email service.
  - Webhook delivery requires a public HTTPS URL (localhost cannot receive
    Xendit/PayMongo callbacks).

================================================================================
7. SUGGESTED DFD LAYOUT
================================================================================

CONTEXT DIAGRAM (Level 0):
   Four external entities around one bubble "0  Katala Online Quotation &
   Service System":
   E1 CUSTOMER, E2 STAFF, E3 ADMIN, E4 XENDIT PAYMENT GATEWAY
   Major context flows:
     CUSTOMER <-> (auth, catalog, quotations, service requests, payments,
                   receipts, notifications)
     STAFF    <-> (work queue, quotation pricing, statuses, schedule,
                   assignment)
     ADMIN    <-> (accounts approval, catalog CRUD, dashboard, CSV backup)
     XENDIT   <-> (create session, hosted checkout, webhook Paid events)

LEVEL-1 DIAGRAM:
   Processes: P1.0..P9.0 from section 3.
   Data stores: D1 Identity, D2 Products, D3 Services, D4 Quotations,
   D5 Service Requests, D6 Payments, D7 Schedule, D8 Notifications,
   D9 Client Store.
   Connect each external entity only to the processes it interacts with
   (see section 6 flows A-E for labeled arrows).

================================================================================
8. QUICK REFERENCE - ENDPOINT INVENTORY
================================================================================
  Public/unauthenticated:
    GET  /api/health
    GET  /api/catalog/materials , /api/catalog/services
    POST /api/auth/register-profile , /api/auth/signup , /api/auth/signin
    POST /api/paymongo/webhook , /api/xendit/webhook
  Portal (any logged-in role):
    GET  /api/auth/portal-session
    PATCH /api/auth/profile
  Customer:
    GET  /api/auth/session , /api/customer/inbox
    POST /api/quotations, /:ref/confirm, /:ref/xendit-checkout,
         /:ref/paymongo-checkout, /:ref/mock-payment
    GET/PATCH/DELETE /api/quotations/:ref
    POST /api/service-requests, /:ref/confirm, /:ref/mock-payment
    GET/PATCH/DELETE /api/service-requests/:ref
    GET  /api/payments/:ref/receipt
  Staff (staff + admin roles):
    GET  /api/staff/work-queue , /api/staff/members
    PATCH /api/staff/quotations/:ref , /api/staff/service-requests/:ref
  Admin:
    GET  /api/admin/accounts , /api/admin/dashboard , /api/admin/database-backup
    PATCH /api/admin/accounts/:userId
    GET/POST /api/admin/materials ; PATCH/DELETE /api/admin/materials/:variantId
    GET/POST /api/admin/services  ; PATCH/DELETE /api/admin/services/:serviceId