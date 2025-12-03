-- Sample subscription plans with different durations
-- This script provides examples of various subscription plans with flexible durations

-- Clear existing plans (optional - be careful in production!)
-- DELETE FROM subscription_plans;

-- Insert sample plans with different durations

-- 1. Daily Pass (1 day premium access)
INSERT INTO subscription_plans (
    plan_name, 
    description, 
    price, 
    daily_mah_limit, 
    max_session_duration_hours,
    fast_charging_access, 
    priority_access, 
    cooldown_percentage, 
    cooldown_time_hour,
    duration_type,
    duration_value
) VALUES (
    'Daily Premium Pass',
    'Premium charging access for 1 day. Perfect for visitors or occasional users.',
    50.00,
    5000,
    4,
    true,
    true,
    20,
    1,
    'daily',
    1
);

-- 2. 3-Day Pass
INSERT INTO subscription_plans (
    plan_name, 
    description, 
    price, 
    daily_mah_limit, 
    max_session_duration_hours,
    fast_charging_access, 
    priority_access, 
    cooldown_percentage, 
    cooldown_time_hour,
    duration_type,
    duration_value
) VALUES (
    '3-Day Premium Pass',
    'Premium charging access for 3 days. Great for short trips or weekend use.',
    120.00,
    5000,
    4,
    true,
    true,
    20,
    1,
    'daily',
    3
);

-- 3. Weekly Pass
INSERT INTO subscription_plans (
    plan_name, 
    description, 
    price, 
    daily_mah_limit, 
    max_session_duration_hours,
    fast_charging_access, 
    priority_access, 
    cooldown_percentage, 
    cooldown_time_hour,
    duration_type,
    duration_value
) VALUES (
    'Weekly Premium Pass',
    'Premium charging access for 1 week. Ideal for business travelers.',
    250.00,
    5000,
    4,
    true,
    true,
    20,
    1,
    'weekly',
    1
);

-- 4. 2-Week Pass
INSERT INTO subscription_plans (
    plan_name, 
    description, 
    price, 
    daily_mah_limit, 
    max_session_duration_hours,
    fast_charging_access, 
    priority_access, 
    cooldown_percentage, 
    cooldown_time_hour,
    duration_type,
    duration_value
) VALUES (
    '2-Week Premium Pass',
    'Premium charging access for 2 weeks. Perfect for extended stays.',
    450.00,
    5000,
    4,
    true,
    true,
    20,
    1,
    'weekly',
    2
);

-- 5. Monthly Premium (existing plan updated)
INSERT INTO subscription_plans (
    plan_name, 
    description, 
    price, 
    daily_mah_limit, 
    max_session_duration_hours,
    fast_charging_access, 
    priority_access, 
    cooldown_percentage, 
    cooldown_time_hour,
    duration_type,
    duration_value
) VALUES (
    'Monthly Premium',
    'Premium charging access for 1 month. Best value for regular users.',
    800.00,
    5000,
    4,
    true,
    true,
    20,
    1,
    'monthly',
    1
);

-- 6. 3-Month Premium
INSERT INTO subscription_plans (
    plan_name, 
    description, 
    price, 
    daily_mah_limit, 
    max_session_duration_hours,
    fast_charging_access, 
    priority_access, 
    cooldown_percentage, 
    cooldown_time_hour,
    duration_type,
    duration_value
) VALUES (
    '3-Month Premium',
    'Premium charging access for 3 months. Great for students or seasonal workers.',
    2200.00,
    5000,
    4,
    true,
    true,
    20,
    1,
    'monthly',
    3
);

-- 7. Quarterly Premium
INSERT INTO subscription_plans (
    plan_name, 
    description, 
    price, 
    daily_mah_limit, 
    max_session_duration_hours,
    fast_charging_access, 
    priority_access, 
    cooldown_percentage, 
    cooldown_time_hour,
    duration_type,
    duration_value
) VALUES (
    'Quarterly Premium',
    'Premium charging access for 1 quarter (3 months). Convenient quarterly billing.',
    2200.00,
    5000,
    4,
    true,
    true,
    20,
    1,
    'quarterly',
    1
);

-- 8. Annual Premium
INSERT INTO subscription_plans (
    plan_name, 
    description, 
    price, 
    daily_mah_limit, 
    max_session_duration_hours,
    fast_charging_access, 
    priority_access, 
    cooldown_percentage, 
    cooldown_time_hour,
    duration_type,
    duration_value
) VALUES (
    'Annual Premium',
    'Premium charging access for 1 year. Best long-term value with significant savings.',
    8000.00,
    5000,
    4,
    true,
    true,
    20,
    1,
    'yearly',
    1
);

-- 9. Free Plan (for comparison)
INSERT INTO subscription_plans (
    plan_name, 
    description, 
    price, 
    daily_mah_limit, 
    max_session_duration_hours,
    fast_charging_access, 
    priority_access, 
    cooldown_percentage, 
    cooldown_time_hour,
    duration_type,
    duration_value
) VALUES (
    'Free Plan',
    'Basic charging access. Limited to free ports only.',
    0.00,
    2000,
    2,
    false,
    false,
    50,
    2,
    'monthly',
    1
);

-- Verify the plans were inserted
SELECT 
    plan_name,
    price,
    duration_type,
    duration_value,
    daily_mah_limit,
    fast_charging_access,
    priority_access
FROM subscription_plans 
ORDER BY price ASC;
