# Database Table Analysis - Tables That Can Be Removed

## Summary
This document analyzes the database schema to identify tables that are not necessary for the system to function. After reviewing the codebase (frontend and backend), here are the findings.

---

## ✅ **CORE TABLES (REQUIRED - DO NOT REMOVE)**

These tables are essential for the system to function:

1. **users** - Core user data
2. **charging_station** - Station information
3. **charging_port** - Port information
4. **charging_session** - Session tracking (critical)
5. **subscription_plans** - Subscription plan definitions
6. **user_subscription** - User subscription tracking
7. **consumption_data** - Real-time consumption data from MQTT
8. **system_logs** - System logging (used extensively)
9. **notification** - User notifications
10. **admin_profiles** - Admin access levels
11. **quota_extension_pricing** - Pricing for quota extensions
12. **quota_extensions** - User quota extension purchases
13. **quota_pricing_history** - History of pricing changes

---

## ⚠️ **POTENTIALLY UNNECESSARY TABLES**

### 1. **daily_energy_usage** ❌ CAN BE REMOVED
**Status:** Not used in codebase
**Reason:** 
- The `charging_session` table already tracks daily consumption via `total_mah_consumed` and `current_daily_mah_consumed` in `user_subscription`
- Daily usage can be calculated from `charging_session` records grouped by date
- No queries found accessing this table in backend or frontend

**Impact:** None - redundant data

---

### 2. **payment** ❌ CAN BE REMOVED (if not using payment tracking)
**Status:** Not used in codebase
**Reason:**
- Payment information is stored in `user_subscription.payment_references` (as text)
- Quota extension payments are tracked in `quota_extensions.payment_reference` and `payment_status`
- No payment processing endpoints found that use this table
- If you plan to track payment history separately, keep it. Otherwise, remove it.

**Impact:** None currently - but consider future payment tracking needs

---

### 3. **device_status_logs** ❌ CAN BE REMOVED
**Status:** Not used in codebase
**Reason:**
- Similar information is stored in `consumption_data` table
- `current_device_status` provides current status
- `system_logs` handles general logging
- No queries found accessing this table

**Impact:** None - redundant logging

---

### 4. **station_maintenance** ⚠️ CONDITIONAL - MAY BE REMOVED
**Status:** Referenced but not actively used
**Reason:**
- `charging_station.last_maintenance_id` references this table
- `charging_station.last_maintenance_date` stores the date
- No admin endpoints found for managing maintenance records
- If you plan to add maintenance tracking features, keep it. Otherwise, the `last_maintenance_date` field is sufficient.

**Impact:** Minimal - only referenced by foreign key, not actively queried

---

### 5. **current_device_status** ⚠️ CONDITIONAL - MAY BE REMOVED
**Status:** Used in some queries but potentially redundant
**Reason:**
- Status information is already stored in `charging_port.current_status`
- Device status can be derived from active `charging_session` records
- Found in one query (`/api/stations/:stationId/ports`) but could be replaced
- If you need historical status snapshots, keep it. Otherwise, redundant with `charging_port`.

**Impact:** Low - one query would need to be updated

---

### 6. **user_devices** ✅ KEEP (Actually used)
**Status:** USED - Has dedicated endpoints
**Reason:**
- Backend has endpoints: `/api/user/devices` (GET and POST)
- Allows users to register their charging devices
- Used for device management features

**Impact:** DO NOT REMOVE - This table is actively used

---

## 📋 **REMOVAL RECOMMENDATIONS**

### **Safe to Remove Immediately:**
1. ✅ **daily_energy_usage** - Completely redundant
2. ✅ **device_status_logs** - Completely redundant
3. ✅ **payment** - Not used (unless you plan payment history tracking)

### **Conditional Removal (Evaluate First):**
1. ⚠️ **station_maintenance** - Only remove if you don't need detailed maintenance tracking
2. ⚠️ **current_device_status** - Only remove if `charging_port.current_status` is sufficient

---

## 🔧 **REMOVAL STEPS**

Before removing any table:

1. **Backup your database**
2. **Check for foreign key constraints** - Drop constraints first
3. **Remove in this order** (respecting dependencies):
   ```
   daily_energy_usage (references user_subscription, users)
   device_status_logs (references charging_port)
   current_device_status (references charging_port)
   payment (references users, user_subscription)
   station_maintenance (referenced by charging_station.last_maintenance_id)
   ```

4. **Update charging_station table** if removing `station_maintenance`:
   ```sql
   ALTER TABLE charging_station DROP COLUMN last_maintenance_id;
   ```

5. **Update queries** that reference `current_device_status`:
   - File: `backend-server/server.js`
   - Endpoint: `/api/stations/:stationId/ports` (around line 624)
   - Replace with `charging_port.current_status`

---

## 📊 **TABLE USAGE SUMMARY**

| Table | Used? | Location | Recommendation |
|-------|-------|----------|----------------|
| users | ✅ Yes | Core table | KEEP |
| charging_station | ✅ Yes | Core table | KEEP |
| charging_port | ✅ Yes | Core table | KEEP |
| charging_session | ✅ Yes | Core table | KEEP |
| subscription_plans | ✅ Yes | Frontend & Backend | KEEP |
| user_subscription | ✅ Yes | Core table | KEEP |
| consumption_data | ✅ Yes | MQTT handler | KEEP |
| system_logs | ✅ Yes | Logging function | KEEP |
| notification | ✅ Yes | Notification system | KEEP |
| admin_profiles | ✅ Yes | Admin checks | KEEP |
| quota_extension_pricing | ✅ Yes | AdminQuotaPricing | KEEP |
| quota_extensions | ✅ Yes | Quota extension system | KEEP |
| quota_pricing_history | ✅ Yes | Pricing history | KEEP |
| user_devices | ✅ Yes | User device endpoints | KEEP |
| daily_energy_usage | ❌ No | None | **REMOVE** |
| payment | ❌ No | None | **REMOVE** (conditional) |
| device_status_logs | ❌ No | None | **REMOVE** |
| station_maintenance | ⚠️ Partial | FK reference only | **CONDITIONAL** |
| current_device_status | ⚠️ Partial | One query | **CONDITIONAL** |

---

## 🎯 **CONCLUSION**

**Recommended for removal:**
- `daily_energy_usage` (100% redundant)
- `device_status_logs` (100% redundant)
- `payment` (not used, but consider future needs)

**Conditional removal:**
- `station_maintenance` (only if maintenance tracking not needed)
- `current_device_status` (only if `charging_port.current_status` is sufficient)

**Estimated space savings:** Varies based on data volume, but removing redundant tables will simplify the schema and reduce maintenance overhead.


