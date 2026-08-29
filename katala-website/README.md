# Katala Website

From the repository root, install and run the website with:

```powershell
npm run install:app
npm run dev
```

Then open `http://localhost:5173/`. The `dev` command starts both the Vite
frontend and the API server. To run only the frontend, use `npm run dev:web`.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

## PayMongo Checkout

Run `database/paymongo_transactions.sql` once in Supabase before accepting payments.

Required server environment variables:

```env
PAYMONGO_SECRET_KEY=sk_test_or_live_key
PAYMONGO_WEBHOOK_SECRET=webhook_endpoint_secret
PAYMONGO_PAYMENT_METHODS=card,gcash,qrph
PAYMONGO_PASS_ON_FEES=false
APP_ORIGIN=http://localhost:5173
```

Register this webhook URL in PayMongo and subscribe it to `checkout_session.payment.paid`:

```text
https://your-domain.com/api/paymongo/webhook
```

The customer payment flow starts from an accepted, priced quotation. After PayMongo confirms payment, the receipt is loaded from `tbl_paymenttransaction` and the related quotation rows.

## Staff and Administrator Access

The sign-in page supports Customer, Staff, and Administrator portals. Staff/admin accounts must have a Supabase Auth role in `app_metadata.role` or `user_metadata.role` set to `staff` or `admin`.

For local/testing overrides, set comma-separated email allowlists in the API environment:

```env
ADMIN_EMAILS=admin@example.com
STAFF_EMAILS=staff@example.com
```
