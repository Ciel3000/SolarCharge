# SolarCharge Project - Authentication System Analysis

## Overview
The SolarCharge project uses **Supabase Authentication** with JWT tokens for managing user authentication and authorization. The system implements a comprehensive authentication flow with session management, role-based access control (admin vs regular users), and protected routes.

---

## Architecture Components

### 1. **Frontend Authentication Layer**

#### **A. Supabase Client** (`frontend/src/supabaseClient.js`)
- Initializes Supabase client using environment variables:
  - `REACT_APP_SUPABASE_URL`
  - `REACT_APP_SUPABASE_ANON_KEY`
- Creates authenticated Supabase client instance for all auth operations

#### **B. Auth Context** (`frontend/src/contexts/AuthContext.js`)
Central authentication state management using React Context API.

**State Management:**
- `session` - Current Supabase session (contains JWT tokens)
- `user` - Current authenticated user object
- `isAdmin` - Boolean flag indicating admin status
- `loading` - Loading state during auth checks
- `subscription` - User's active subscription data
- `plans` - Available subscription plans
- `error` - Authentication errors
- `initialized` - Flag indicating if auth has been initialized

**Key Functions:**

1. **Session Initialization** (`useEffect` on mount)
   - Calls `supabase.auth.getSession()` to retrieve existing session
   - Fetches admin status via `/api/me` endpoint
   - Fetches user subscription and plans
   - Sets up real-time auth state listener

2. **Auth State Change Listener** (`onAuthStateChange`)
   - Listens for auth events: `SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED`
   - Updates session and user state on changes
   - Re-checks admin status and fetches subscription data

3. **Admin Status Check** (`checkAdminStatus`)
   - Makes authenticated request to `/api/me` endpoint
   - Sends JWT token in `Authorization: Bearer <token>` header
   - Updates `isAdmin` state based on response

4. **Session Expiration Monitoring**
   - Decodes JWT to check expiration time
   - Sets timeout to automatically expire session
   - Handles session timeout on page visibility change

5. **Session Recovery** (`recoverSession`)
   - Attempts to recover lost session
   - Has 15-second timeout protection
   - Resets auth state on failure

**Exposed Methods:**
- `signIn(email, password)` - Sign in user
- `signOut()` - Sign out user
- `recoverSession()` - Attempt session recovery
- `clearError()` - Clear error state

---

### 2. **Authentication Pages**

#### **A. Login Page** (`frontend/src/pages/LoginPage.js`)
**Flow:**
1. User enters email and password
2. Calls `supabase.auth.signInWithPassword({ email, password })`
3. On success:
   - Supabase returns session with JWT tokens
   - `onAuthStateChange` event fires with `SIGNED_IN`
   - AuthContext updates session/user state
   - Navigation happens based on user role:
     - Admin → `/admin/dashboard`
     - Regular user → `/home`

**Features:**
- Auto-redirect if already logged in
- Password visibility toggle
- Error message display
- Redirect to intended page after login (if redirected from protected route)

#### **B. Sign Up Page** (`frontend/src/pages/SignUpPage.js`)
**Flow:**
1. User enters email and password
2. Calls `supabase.auth.signUp({ email, password })`
3. Supabase creates auth user and sends confirmation email
4. User must confirm email before login

**Features:**
- Referral code support (passed in metadata)
- Email confirmation required
- Auto-redirect if already logged in

---

### 3. **Backend Authentication Layer**

#### **A. JWT Verification Middleware** (`backend-server/server.js`)

**1. `verifySupabaseJWT(token)`** (Lines 2872-2887)
- Verifies JWT using HS256 algorithm
- Uses `SUPABASE_JWT_SECRET` from environment variables
- Returns decoded JWT payload on success
- Throws error if token is invalid/expired

**2. `supabaseAuthMiddleware`** (Lines 2890-2911)
Express middleware that protects API routes:

```javascript
async function supabaseAuthMiddleware(req, res, next) {
    // 1. Extract token from Authorization header
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }
    
    // 2. Extract token
    const token = auth.replace('Bearer ', '');
    
    // 3. Verify JWT
    const payload = await verifySupabaseJWT(token);
    
    // 4. Attach user info to request object
    req.user = {
        user_id: payload.sub,  // User ID from JWT
        email: payload.email,
        role: payload.role
    };
    
    // 5. Continue to next middleware
    next();
}
```

**3. `requireAdmin`** (Lines 2914-2929)
Role-based access control middleware:
- Checks if user exists in database
- Queries `users` table for `is_admin` flag
- Returns 403 if user is not admin
- Must be used after `supabaseAuthMiddleware`

#### **B. User Profile Endpoint** (`/api/me`)
**Purpose:** Returns current user's profile and admin status

**Flow:**
1. Protected by `supabaseAuthMiddleware`
2. Extracts `user_id` from verified JWT token (`req.user.user_id`)
3. Queries database for user profile
4. Returns:
   ```json
   {
     "user_id": "...",
     "fname": "...",
     "lname": "...",
     "is_admin": true/false,
     "admin_access_level": "..." (if admin)
   }
   ```

---

## Complete Authentication Flow

### **Sign Up Flow:**
```
1. User visits SignUpPage
   ↓
2. User enters email/password → clicks "Sign Up"
   ↓
3. Frontend: supabase.auth.signUp({ email, password })
   ↓
4. Supabase: Creates auth user, sends confirmation email
   ↓
5. User confirms email (via email link)
   ↓
6. AuthContext: onAuthStateChange fires → session created
   ↓
7. Frontend: Redirects to /home or /admin/dashboard
```

### **Sign In Flow:**
```
1. User visits LoginPage
   ↓
2. User enters email/password → clicks "Sign In"
   ↓
3. Frontend: supabase.auth.signInWithPassword({ email, password })
   ↓
4. Supabase: Validates credentials → returns JWT tokens
   ↓
5. AuthContext: onAuthStateChange fires with SIGNED_IN event
   ↓
6. AuthContext: Sets session/user state
   ↓
7. AuthContext: Calls /api/me to check admin status
   ↓
8. Backend: Verifies JWT → queries database → returns user info
   ↓
9. AuthContext: Sets isAdmin flag
   ↓
10. Frontend: Redirects based on role:
    - Admin → /admin/dashboard
    - Regular user → /home
```

### **Protected Route Access Flow:**
```
1. User navigates to protected route (e.g., /home, /admin/dashboard)
   ↓
2. App.js: Checks if session exists
   ↓
3a. No session → Redirect to /login with redirect reason
   ↓
3b. Session exists → Continue
   ↓
4. For admin routes: Check isAdmin flag
   ↓
5a. Not admin → Redirect to /home with error message
   ↓
5b. Is admin → Render admin page
```

### **API Request Flow:**
```
1. Frontend component makes API call (e.g., fetch('/api/user/subscription'))
   ↓
2. Frontend: Adds Authorization header with JWT token
   Authorization: Bearer <access_token>
   ↓
3. Backend: supabaseAuthMiddleware intercepts request
   ↓
4. Middleware: Extracts token from header
   ↓
5. Middleware: Verifies JWT using SUPABASE_JWT_SECRET
   ↓
6a. Invalid/expired token → Returns 401 Unauthorized
   ↓
6b. Valid token → Attaches user info to req.user
   ↓
7. Route handler: Uses req.user.user_id for database queries
   ↓
8. Response: Returns data specific to authenticated user
```

---

## Route Protection

### **Frontend Route Protection** (`App.js`)

**Public Routes:**
- `/landing` - Public landing page
- `/login` - Login page
- `/signup` - Sign up page

**User Protected Routes:**
- `/home` - Requires session
- `/subscription` - Requires session, blocks admins
- `/usage` - Requires session, blocks admins
- `/stations` - Requires session, blocks admins
- `/station` - Requires session, blocks admins
- `/profile` - Requires session, blocks admins

**Admin Protected Routes:**
- `/admin/dashboard` - Requires session + isAdmin
- `/admin/users` - Requires session + isAdmin
- `/admin/plans` - Requires session + isAdmin
- `/admin/stations` - Requires session + isAdmin
- `/admin/sessions` - Requires session + isAdmin
- `/admin/revenue` - Requires session + isAdmin
- `/admin/system-status` - Requires session + isAdmin
- `/admin/logs` - Requires session + isAdmin
- `/admin/quota-pricing` - Requires session + isAdmin

**Protection Logic:**
```javascript
<Route path="/home" element={
  !session ? (
    <LoginPage message="Please log in to access this page." />
  ) : isAdmin ? (
    <AdminDashboard />
  ) : (
    <HomePage />
  )
} />
```

### **Backend API Protection**

**User Endpoints** (require authentication):
- `GET /api/me` - User profile
- `GET /api/user/subscription` - User subscription
- `GET /api/user/usage` - User usage data
- `POST /api/quota/purchase-extension` - Purchase quota extension
- All endpoints use `supabaseAuthMiddleware`

**Admin Endpoints** (require authentication + admin):
- `GET /api/admin/*` - All admin endpoints
- Use both `supabaseAuthMiddleware` and `requireAdmin`
- Example: `app.get('/api/admin/users', supabaseAuthMiddleware, requireAdmin, ...)`

---

## Session Management

### **Session Lifecycle:**

1. **Session Creation**
   - Created when user signs in successfully
   - Stored in Supabase client (browser localStorage)
   - Contains:
     - `access_token` (JWT) - Short-lived (~1 hour)
     - `refresh_token` - Used to get new access tokens
     - `user` object - User metadata

2. **Session Validation**
   - On app load: `supabase.auth.getSession()` checks for existing session
   - JWT expiration checked by decoding token
   - Frontend monitors expiration and clears session when expired

3. **Token Refresh**
   - Supabase automatically refreshes tokens before expiration
   - `TOKEN_REFRESHED` event fires in `onAuthStateChange`
   - New session is set in AuthContext

4. **Session Expiration**
   - Frontend checks JWT expiration time
   - Sets timeout to automatically expire session
   - On expiration: Clears session, redirects to login
   - Also checks on page visibility change (tab switch)

5. **Session Recovery**
   - Attempts to recover session if lost
   - 15-second timeout to prevent hanging
   - Resets auth state on failure

### **Sign Out Flow:**
```
1. User clicks "Sign Out"
   ↓
2. Frontend: Calls supabase.auth.signOut()
   ↓
3. Supabase: Clears session tokens
   ↓
4. AuthContext: onAuthStateChange fires with SIGNED_OUT event
   ↓
5. AuthContext: Clears all auth state (session, user, isAdmin, etc.)
   ↓
6. Frontend: Navigates to /landing page
```

---

## Security Features

### **Frontend:**
1. ✅ JWT tokens stored securely by Supabase client
2. ✅ Automatic token refresh before expiration
3. ✅ Session expiration monitoring
4. ✅ Route protection based on auth state
5. ✅ Admin role separation

### **Backend:**
1. ✅ JWT verification using shared secret (HS256)
2. ✅ Authorization header validation
3. ✅ Role-based access control (admin middleware)
4. ✅ Database-backed admin status check
5. ✅ Comprehensive error logging

### **Potential Security Considerations:**
- ⚠️ JWT secret should be kept secure in environment variables
- ⚠️ HTTPS should be used in production to protect tokens in transit
- ⚠️ Consider implementing refresh token rotation for enhanced security
- ⚠️ Session timeout could be configurable per environment

---

## Environment Variables Required

### **Frontend (.env):**
```env
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key
REACT_APP_BACKEND_URL=http://localhost:3001
```

### **Backend (.env):**
```env
SUPABASE_JWT_SECRET=your-jwt-secret
# ... other variables
```

---

## Key Files Reference

### **Frontend:**
- `frontend/src/supabaseClient.js` - Supabase client initialization
- `frontend/src/contexts/AuthContext.js` - Auth state management
- `frontend/src/pages/LoginPage.js` - Login UI and logic
- `frontend/src/pages/SignUpPage.js` - Sign up UI and logic
- `frontend/src/App.js` - Route protection and navigation

### **Backend:**
- `backend-server/server.js` - Auth middleware and API endpoints
  - Lines 2833-2911: Auth middleware
  - Lines 2577-2606: `/api/me` endpoint
  - Lines 2914-2929: Admin middleware

---

## Authentication State Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    User Authentication Flow                  │
└─────────────────────────────────────────────────────────────┘

[Sign Up/Login] → Supabase Auth → JWT Tokens
                          ↓
                  AuthContext (Session State)
                          ↓
        ┌─────────────────┴─────────────────┐
        ↓                                   ↓
   Frontend Routes                    Backend API
        ↓                                   ↓
  Route Guards                    supabaseAuthMiddleware
  (session check)                        ↓
        ↓                          JWT Verification
  Render Protected                   ↓
     Pages                      req.user attached
        ↓                              ↓
  Display Content              Database Query (user_id)
                                  ↓
                            Response Data
```

---

## Summary

The SolarCharge authentication system is a **comprehensive, secure implementation** using:

1. **Supabase Authentication** - Handles user sign up, sign in, session management
2. **JWT-based API Authentication** - Backend verifies tokens for all protected endpoints
3. **Role-Based Access Control** - Separate admin and regular user routes
4. **Session Lifecycle Management** - Automatic expiration, refresh, and recovery
5. **Frontend State Management** - Centralized auth state via React Context
6. **Route Protection** - Both frontend routes and backend APIs are protected

The system provides a solid foundation for secure user authentication with proper separation of concerns between frontend and backend layers.






