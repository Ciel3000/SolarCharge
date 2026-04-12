# ESLint Warnings Fix Plan

This plan addresses all ESLint warnings in the React codebase, categorized by issue type.

## Summary of Issues

- **Missing dependencies in useCallback/useEffect**: ~25 instances
- **Unused variables**: ~20 instances
- **Unnecessary dependencies**: 1 instance

---

## 1. NotificationContext.js (5 issues)

### Issue: Missing BACKEND_URL in useCallback dependencies

**Files**: `frontend/src/contexts/NotificationContext.js`

**Fix**: Add `BACKEND_URL` to each useCallback dependency array:

| Line | Function |
|------|----------|
| 43 | `fetchNotifications` |
| 63 | `fetchUnreadCount` |
| 92 | `markAsRead` |
| 116 | `markAllAsRead` |
| 143 | `deleteNotification` |

---

## 2. AuthContext.js (3 issues)

### 2.1 Line 91: Unnecessary dependency `handleSessionTimeout`
**Function**: `checkAdminStatus`

**Fix**: Remove `handleSessionTimeout` from the dependency array.

### 2.2 Line 303: Missing dependencies
**Function**: Main useEffect (initializeAuth)

**Fix**: Add dependencies: `[checkAdminStatus, fetchSubscriptionAndPlans, initialized, session, sessionTimeout]`

### 2.3 Line 343: Missing dependency
**Function**: Session monitoring useEffect

**Fix**: Add to dependencies: `[session, isSessionExpired, handleSessionTimeout, sessionTimeout]`

---

## 3. AdminPlans.js (4 issues)

- Line 7: Remove unused `BACKEND_URL`
- Line 10: Remove unused `session` and `user`
- Line 63: Add `fetchPlans` to dependency array

---

## 4. AdminLogs.js (1 issue)

- Line 50: Add `fetchLogs` to dependency array

---

## 5. AdminQuotaPricing.js (1 issue)

- Line 10: Remove unused `navigate`

---

## 6. AdminSessions.js (1 issue)

- Line 28: Add `fetchSessions` to dependency array

---

## 7. AdminStations.js (1 issue)

- Line 15: Remove unused `batteryLevels`

---

## 8. AdminSystemStatus.js (3 issues)

- Line 83: Add `fetchSystemLogs` to dependency array
- Lines 206, 217: Remove unused `getBatteryColor`, `getLogTypeColor`

---

## 9. AdminUsers.js (1 issue)

- Line 128: Add `fetchAvailablePlans` and `fetchUsers` to dependency array

---

## 10. HomePage.js (6 issues)

- Line 13: Remove unused `navigate`
- Lines 29-30: Remove unused `filter`, `stationId`
- Line 133: Add `stations.length` to dependency array
- Line 170: Remove unused `vendor`
- Lines 377, 405: Add `saveDeviceToDatabase` to dependency arrays

---

## 11. LandingPagePublic.js (2 issues)

- Line 9: Use or remove `isMenuOpen`
- Line 128: Use or remove `scrollToSection`

---

## 12. LoginPage.js (1 issue)

- Line 57: Add `redirectReason` to dependency array, OR use `// eslint-disable-next-line` comment if intentional one-time effect

---

## 13. StationPage.js (6 issues)

- Lines 20, 27-28: Remove unused `refreshKey`, `setRefreshKey`, `statusIntervalRef`, `sessionIntervalRef`
- Lines 113, 144: Add `handleSessionTimeout` to dependency arrays

---

## 14. StationsPage.js (2 issues)

- Line 4: Remove unused `generateGoogleMapsUrl` import
- Line 54: Add `stations.length` to dependency array

---

## 15. SubscriptionPage.js (1 issue)

- Line 44: Remove unused `paypalLoading`

---

## 16. UsagePage.js (5 issues)

- Line 35: Remove unused `showQuotaModal`
- Line 127: Add `calculateSubscriptionUsage` to dependency array
- Line 209: Use or remove `getStatusColor`
- Line 272: Remove unused `remaining`
- Line 367: Remove unused `direct`

---

## 17. App.js (3 issues)

- Line 38: Remove unused `subscription` from destructuring
- Lines 219-220: Remove unused `showAdminNavigation`, `showUserNavigation`

---

## 18. SessionStatusIndicator.js (1 issue)

- Line 5: Remove unused `isSessionExpired` import

---

## Implementation Order

1. **Quick fixes (remove unused)**: Start with files that have simple unused variable issues
2. **Context files**: Fix AuthContext and NotificationContext first (affects many components)
3. **Page files**: Fix each page file systematically
4. **Verify**: Run `npm run lint` to confirm all issues are resolved

---

## Notes

- Some "missing dependency" warnings can be safely addressed by adding `// eslint-disable-next-line` comments when the dependency should deliberately NOT trigger re-renders (e.g., empty arrays for one-time effects)
- Constants like `BACKEND_URL` defined at component level are better candidates for inclusion in dependencies than moving inside callbacks
- For interval/timeout cleanup patterns, consider using refs instead of adding functions to dependencies

---

---

# PayPal Subscription Fix Plan

## Problem
- Subscriptions not created in production database
- Sandbox works (logs payment)
- No webhook - client-side payment verification only

## Root Causes Identified
1. No server-side webhook from PayPal - relies on frontend callback
2. No payment record created in `payment` table
3. Missing PRODUCTION PayPal client ID (falls back to sandbox)
4. No server verification that payment actually succeeded

## Current Flow (Broken)

1. User pays via PayPal (frontend popup)
2. PayPal returns to frontend via `onPayPalApprove` callback
3. Frontend calls `/api/subscription/create` - tells server "payment succeeded"
4. Server creates subscription WITHOUT verifying payment actually happened

This is insecure - anyone can call the API without paying.

## Solution Plan

### Step 1: Verify PayPal Client ID Configuration
- Check frontend/.env or environment variables
- Ensure `REACT_APP_PAYPAL_CLIENT_ID` is set to PRODUCTION client ID
- `SubscriptionPage.js` line 12 defaults to 'sb' if env var not set

### Step 2: Add Server-Side Payment Verification (Recommended)
Verify payment server-side using PayPal API:

1. **Frontend sends `orderID`** to backend after PayPal capture
2. **Server calls PayPal Get Order API** to verify payment status
3. **Verify status is "COMPLETED"** before creating subscription
4. **Create payment record** in `payment` table
5. **Create subscription** in `user_subscription` table

### Files to Modify
- `backend-server/server.js` - `/api/subscription/create` endpoint
- `frontend/src/pages/SubscriptionPage.js` - send orderID to backend

## Implementation Status

TODO - Not yet implemented

1. **NotificationContext.js** - Fixed all 5 BACKEND_URL dependencies
2. **AuthContext.js** - Fixed dependency issues
3. **AdminPlans.js** - Removed unused variables
4. **AdminLogs.js** - Added fetchLogs to deps (warning remains - pattern issue)
5. **AdminSessions.js** - Added fetchSessions to deps (warning remains - pattern issue)
6. **AdminStations.js** - Restored batteryLevels state
7. **AdminSystemStatus.js** - Removed unused getBatteryColor, getLogTypeColor
8. **AdminUsers.js** - Added fetchUsers, fetchAvailablePlans to deps
9. **HomePage.js** - Fixed dependencies, removed unused vars
10. **LandingPagePublic.js** - Fixed imports/exports
11. **LoginPage.js** - Added eslint-disable comment
12. **StationPage.js** - Removed unused refs
13. **StationsPage.js** - Added stations.length to deps
14. **SubscriptionPage.js** - Added eslint-disable
15. **UsagePage.js** - Fixed dependencies
16. **App.js** - Removed unused subscription from destructure
17. **SessionStatusIndicator.js** - Removed unused import