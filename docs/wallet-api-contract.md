# Wallet and Payments API Contract

Base URL example: /api/v1
Auth: Bearer JWT (driver or admin role)
Currency: USD

## 1) Get wallet summary
GET /wallet/me

Response 200
```json
{
  "walletId": "f1f3c3f5-9c7d-4c77-b886-2f3f7fdbabc1",
  "driverId": "9acbc7a2-ec17-4b80-8a7b-4f3b2f197ed0",
  "balanceUsd": 24.50,
  "currency": "USD",
  "status": "active"
}
```

## 2) Get movement history
GET /wallet/movements?limit=20&cursor=...

Response 200
```json
{
  "items": [
    {
      "id": "9ca0ef0c-1d95-4ab7-a4d1-a2a9506ea0f2",
      "type": "service_fee",
      "amountUsd": -1.00,
      "balanceBefore": 25.50,
      "balanceAfter": 24.50,
      "serviceId": "a2bf63c8-3aa2-41af-ae9e-8e93604af922",
      "createdAt": "2026-06-29T13:00:01.000Z"
    }
  ],
  "nextCursor": null
}
```

## 3) Create topup intent
POST /wallet/topup/create-intent

Request
```json
{
  "amountUsd": 10.00,
  "provider": "kushki"
}
```

Response 201
```json
{
  "paymentId": "b1d49886-447d-47ee-9da7-2216e66d7f2c",
  "status": "pending",
  "provider": "kushki",
  "checkout": {
    "publicKey": "pk_test_xxx",
    "clientToken": "token_xxx",
    "sessionId": "sess_xxx"
  }
}
```

## 4) Provider webhook
POST /payments/webhook/:provider

Headers:
- X-Signature: provider signature

Response 200
```json
{ "ok": true }
```

Behavior:
- Validate signature
- Enforce idempotency with provider event_id
- If paid, credit wallet and insert movement type topup

## 5) Complete service and charge $1 fee
POST /services/:serviceId/complete-and-charge

Request
```json
{
  "driverId": "9acbc7a2-ec17-4b80-8a7b-4f3b2f197ed0"
}
```

Response 200
```json
{
  "serviceId": "a2bf63c8-3aa2-41af-ae9e-8e93604af922",
  "charged": true,
  "feeUsd": 1.00,
  "walletBalanceUsd": 23.50
}
```

Error 402 (insufficient balance)
```json
{
  "error": "insufficient_balance",
  "message": "Driver balance is below 1.00 USD"
}
```

## 6) Admin manual adjustment
POST /wallet/adjustment/admin

Request
```json
{
  "driverId": "9acbc7a2-ec17-4b80-8a7b-4f3b2f197ed0",
  "amountUsd": 3.00,
  "note": "Manual correction"
}
```

Response 200
```json
{
  "ok": true,
  "walletBalanceUsd": 26.50
}
```

## Validation rules
- amountUsd for topup: >= 1.00 and <= 200.00
- service fee: fixed 1.00
- all wallet updates must run in DB transaction with row lock
- every balance change must create one movement row
- webhook processing must be idempotent
