# PayPal Subscription Payment Issues

## Problem
- Subscriptions not created in production database
- Sandbox works (logs payment)
- No webhook - client-side payment verification only

## Root Causes

1. **No server-side webhook from PayPal** - relies on frontend callback
2. **No payment record created** - `payment` table never gets populated
3. **Missing PRODUCTION PayPal client ID** - falls back to sandbox (`sb`)
4. **No server verification** - anyone can call `/api/subscription/create` without paying

---

## Current Flow (Broken)

1. User pays via PayPal (frontend popup)
2. PayPal returns to frontend via `onPayPalApprove` callback
3. Frontend calls `/api/subscription/create` - tells server "payment succeeded"
4. Server creates subscription WITHOUT verifying payment actually happened

**Why it's broken:** Server trusts the frontend completely. No verification that payment actually went through.

---

## Solution Plan

### Step 1: Fix PayPal Client ID (Quickest Fix)

**Check:** `frontend/.env` or environment variables

**Current code (SubscriptionPage.js line 12):**
```javascript
const PAYPAL_CLIENT_ID = process.env.REACT_APP_PAYPAL_CLIENT_ID || 'sb';
```

- If `REACT_APP_PAYPAL_CLIENT_ID` isn't set in production, it uses sandbox
- Get a production PayPal client ID from developer.paypal.com

### Step 2: Add Server-Side Payment Verification (Proper Fix)

**Frontend changes (`SubscriptionPage.js`):**
- Send `orderID` to backend after PayPal capture

**Backend changes (`server.js` - `/api/subscription/create`):**
- Accept `orderID` from frontend
- Call PayPal API to verify payment status
- Only create subscription if status is "COMPLETED"
- Create payment record in `payment` table

**PayPal API to use:**
```
GET https://api-m.paypal.com/v2/checkout/orders/{orderID}
```
or sandbox:
```
GET https://api-m.sandbox.paypal.com/v2/checkout/orders/{orderID}
```

**Expected response includes:**
```json
{
  "status": "COMPLETED",
  "purchase_units": [{
    "payments": {
      "captures": [{ "id": "..." }]
    }
  }]
}
```

---

## Implementation Order

1. **Quick fix:** Set production PayPal client ID in env
2. **Proper fix:** Implement server-side verification
3. **Database:** Ensure payment records are created

---

## Files to Modify

| File | Change |
|------|--------|
| `backend-server/server.js` | `/api/subscription/create` - verify payment, create payment record |
| `frontend/src/pages/SubscriptionPage.js` | Send `orderID` to backend |

---

## Implementation Status

**COMPLETED** - Implemented the following changes:

### 1. Backend changes (`server.js`)
- Added `verifyPayPalOrder()` function to verify payments with PayPal API
- Updated `/api/subscription/create` to:
  - Accept `order_id` from frontend
  - Verify payment with PayPal before creating subscription
  - Create payment record in `payment` table
  - Only create subscription if payment verified

### 2. Frontend changes (`SubscriptionPage.js`)
- Updated `onPayPalApprove` callback to send `orderID` to backend

### 3. Environment configuration (`backend-server/.env`)
- Added PayPal credentials:
  - `PAYPAL_CLIENT_ID`
  - `PAYPAL_CLIENT_SECRET`
  - `PAYPAL_MODE`

### Next Steps
- Add your PayPal credentials to `backend-server/.env`:
  - `PAYPAL_CLIENT_ID=your_client_id`
  - `PAYPAL_CLIENT_SECRET=your_client_secret`
  - `PAYPAL_MODE=sandbox` (or "live" for production)
- For sandbox: Get credentials from developer.paypal.com (create sandbox app)
- For production: Get credentials from developer.paypal.com (create live app)

### Changes Made
1. Frontend: Changed PayPal intent from "subscription" to "CAPTURE" for simpler flow
2. Frontend: Added onCancel handler for debugging cancelled payments
3. Backend: Added dev mode - skips verification when NODE_ENV=development
4. Backend: Payment record now created with order ID if no transaction ID