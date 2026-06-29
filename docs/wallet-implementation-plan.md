# Wallet Implementation Plan for Qivo

## Objective
Allow drivers to recharge wallet balance with debit/credit cards and deduct 1.00 USD for each completed service.

## Phase 1 - Backend foundation
1. Create PostgreSQL schema from wallet-schema.sql.
2. Add auth with JWT and roles: driver, admin.
3. Build wallet read endpoints:
- GET /wallet/me
- GET /wallet/movements
4. Build service completion endpoint with atomic fee charge:
- POST /services/:serviceId/complete-and-charge

Done criteria:
- Balance updates are transaction-safe.
- No duplicate charge on retry (idempotency on serviceId + driverId).

## Phase 2 - Payment provider integration
1. Pick provider (Kushki, PayPhone, or Stripe).
2. Add endpoint:
- POST /wallet/topup/create-intent
3. Add webhook endpoint:
- POST /payments/webhook/:provider
4. Validate signatures and implement idempotent event storage.
5. On successful payment, credit wallet and insert movement type topup.

Done criteria:
- Successful topup appears in balance and movement history.
- Duplicate webhook does not double-credit.

## Phase 3 - Driver UI in APP Qivo
1. Add wallet card in driver profile:
- Current balance
- Recharge button
2. Add recharge modal:
- Quick amounts 5, 10, 20
- Provider checkout integration
3. Add movement list in driver panel.
4. Show warning if balance < 1.00.

Done criteria:
- Driver can topup and see updated balance.
- Driver can review recent movements.

## Phase 4 - Controls and operations
1. Admin adjustment endpoint and screen.
2. Daily reconciliation report:
- provider paid events vs local credited payments
3. Alerts for payment failures and webhook signature errors.

## Security checklist
- Never store raw card data or CVV.
- Process cards only via provider SDK/hosted form.
- Verify webhook signatures.
- Use HTTPS everywhere.
- Add rate limits to payment endpoints.
- Log all wallet changes with who/when/why.

## Suggested next coding step
Implement Phase 1 first in a separate backend service (Node.js + Express + PostgreSQL), then connect APP Qivo frontend to /wallet/me and /wallet/movements.
