# Qivo Wallet Backend

API backend for wallet topups and service fee deduction.

## 1. Install

```bash
npm install
```

## 2. Environment

Copy `.env.example` to `.env` and set real values.

## 3. Run

```bash
npm run dev
```

The API starts at `http://localhost:4000` by default.

## Auth model (temporary)

For development, this backend reads:
- `x-driver-id`: UUID of the authenticated driver
- `x-role`: `driver` or `admin`

Use real JWT authentication before production.
