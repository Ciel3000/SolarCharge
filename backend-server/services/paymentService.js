// backend-server/services/paymentService.js
// Payment business logic with database operations

const { v4: uuidv4 } = require('uuid');

/**
 * Get tier pricing from the database
 * @param {object} pool - The database pool
 * @param {string} planId - The plan ID
 * @returns {object} Pricing details including requiresPayment flag
 */
async function getTierPricing(pool, planId) {
    const { rows } = await pool.query(
        `SELECT plan_id, plan_name, price, daily_mah_limit, duration_type, duration_value
         FROM subscription_plans 
         WHERE plan_id = $1 AND is_active = true`,
        [planId]
    );

    if (rows.length === 0) {
        throw new Error('Plan not found or inactive');
    }

    const plan = rows[0];

    // FREE tier - no PayPal needed
    if (parseFloat(plan.price) === 0) {
        return { 
            requiresPayment: false, 
            plan 
        };
    }

    return { 
        requiresPayment: true, 
        plan 
    };
}

/**
 * Get quota extension pricing from the database
 * @param {object} pool - The database pool
 * @param {string} extensionType - The extension type
 * @returns {object} Pricing details
 */
async function getQuotaExtensionPricing(pool, extensionType = 'direct_purchase') {
    const { rows } = await pool.query(
        `SELECT id, extension_type, price_per_transaction, extension_amount_mah, is_active
         FROM quota_extension_pricing
         WHERE extension_type = $1 AND is_active = true`,
        [extensionType]
    );

    if (rows.length === 0) {
        throw new Error('Quota extension pricing not found or inactive');
    }

    return rows[0];
}

/**
 * Log payment event to payment_logs table
 * @param {object} pool - The database pool
 * @param {string} userId - User ID (optional)
 * @param {string} action - Action type
 * @param {object} payload - Request payload
 * @param {object} response - Response data
 * @param {string} status - Status of the action
 */
async function logPaymentEvent(pool, userId, action, payload, response, status) {
    await pool.query(
        `INSERT INTO payment_logs (user_id, action, payload, response, status)
         VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)`,
        [userId, action, JSON.stringify(payload), JSON.stringify(response), status]
    );
}

/**
 * Process successful payment - handles both subscription and quota_extension
 * @param {object} pool - The database pool
 * @param {string} orderId - The PayPal order ID
 * @param {object} captureData - The PayPal capture response
 * @param {string} userId - The user ID
 * @returns {object} Result with subscriptionId or extension details
 */
async function processSuccessfulPayment(pool, orderId, captureData, userId) {
    // Start a transaction
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        // Get the order from paypal_orders
        const orderResult = await client.query(
            `SELECT * FROM paypal_orders WHERE order_id = $1`,
            [orderId]
        );

        if (orderResult.rows.length === 0) {
            throw new Error('Order not found');
        }

        const dbOrder = orderResult.rows[0];

        // Verify the order belongs to the user
        if (dbOrder.user_id !== userId) {
            throw new Error('Order does not belong to user');
        }

        // Get the capture ID from PayPal response
        const paypalCaptureId = captureData.purchase_units?.[0]?.payments?.captures?.[0]?.id 
            || captureData.id;

        // Update paypal_orders: Set status = 'COMPLETED', paypal_capture_id
        await client.query(
            `UPDATE paypal_orders 
             SET status = 'COMPLETED', paypal_capture_id = $1, updated_at = NOW()
             WHERE order_id = $2`,
            [paypalCaptureId, orderId]
        );

        // Insert into payments table
        const paymentId = uuidv4();
        await client.query(
            `INSERT INTO payments (id, user_id, paypal_order_id, payment_capture_id, payment_type, amount, currency, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed')`,
            [paymentId, userId, orderId, paypalCaptureId, dbOrder.payment_type, dbOrder.amount, dbOrder.currency || 'PHP']
        );

        let result;

        // Branch on payment_type
        if (dbOrder.payment_type === 'subscription') {
            result = await processSubscriptionPayment(client, userId, dbOrder, paypalCaptureId);
        } else if (dbOrder.payment_type === 'quota_extension') {
            result = await processQuotaExtensionPayment(client, userId, dbOrder, paypalCaptureId);
        } else {
            throw new Error('Unknown payment type: ' + dbOrder.payment_type);
        }

        await client.query('COMMIT');
        return result;

    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Process subscription payment - create/update user subscription
 * @param {object} client - Database client (transaction)
 * @param {string} userId - User ID
 * @param {object} dbOrder - The order from paypal_orders
 * @param {string} captureId - PayPal capture ID
 * @returns {object} Subscription result
 */
async function processSubscriptionPayment(client, userId, dbOrder, captureId) {
    // Get plan details
    const planResult = await client.query(
        `SELECT * FROM subscription_plans WHERE plan_id = $1`,
        [dbOrder.plan_id]
    );

    if (planResult.rows.length === 0) {
        throw new Error('Plan not found');
    }

    const plan = planResult.rows[0];
    
    // Calculate subscription end date
    const startDate = new Date();
    let endDate = new Date();
    
    switch (plan.duration_type?.toLowerCase()) {
        case 'daily':
            endDate.setDate(endDate.getDate() + plan.duration_value);
            break;
        case 'weekly':
            endDate.setDate(endDate.getDate() + (plan.duration_value * 7));
            break;
        case 'monthly':
            endDate.setMonth(endDate.getMonth() + plan.duration_value);
            break;
        case 'quarterly':
            endDate.setMonth(endDate.getMonth() + (plan.duration_value * 3));
            break;
        case 'yearly':
            endDate.setFullYear(endDate.getFullYear() + plan.duration_value);
            break;
        default:
            endDate.setMonth(endDate.getMonth() + 1);
    }

    const subscriptionId = uuidv4();

    // Check if user already has a subscription
    const existingSub = await client.query(
        `SELECT user_subscription_id FROM user_subscription WHERE user_id = $1`,
        [userId]
    );

    if (existingSub.rows.length > 0) {
        // Update existing subscription
        await client.query(
            `UPDATE user_subscription 
             SET plan_id = $1, is_active = true, start_date = $2, end_date = $3, 
                 current_daily_mah_consumed = 0, updated_at = NOW()
             WHERE user_id = $5`,
            [dbOrder.plan_id, startDate, endDate, plan.daily_mah_limit, userId]
        );
        
        return {
            status: 'COMPLETED',
            subscriptionId: existingSub.rows[0].user_subscription_id,
            message: 'Subscription updated successfully'
        };
    } else {
        // Insert new subscription
        await client.query(
            `INSERT INTO user_subscription (user_subscription_id, user_id, plan_id, is_active, start_date, end_date, current_daily_mah_consumed)
             VALUES ($1, $2, $3, true, $4, $5, 0)`,
            [subscriptionId, userId, dbOrder.plan_id, startDate, endDate]
        );
        
        return {
            status: 'COMPLETED',
            subscriptionId,
            message: 'Subscription activated successfully'
        };
    }
}

/**
 * Process quota extension payment - add to user's quota
 * @param {object} client - Database client (transaction)
 * @param {string} userId - User ID
 * @param {object} dbOrder - The order from paypal_orders
 * @param {string} captureId - PayPal capture ID
 * @returns {object} Extension result
 */
async function processQuotaExtensionPayment(client, userId, dbOrder, captureId) {
    // Get the extension amount from the order or calculate from pricing
    const extensionAmountMah = dbOrder.amount * 1000; // Assuming price is per 1000 mAh
    
    // Get current active subscription to link the extension
    const subscriptionResult = await client.query(
        `SELECT user_subscription_id FROM user_subscription WHERE user_id = $1 AND is_active = true`,
        [userId]
    );

    const subscriptionId = subscriptionResult.rows[0]?.id || null;

    const extensionId = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // Extensions expire in 30 days

    // Insert quota extension record
    await client.query(
        `INSERT INTO quota_extensions (id, user_id, subscription_id, paypal_order_id, paypal_capture_id, purchased_amount_mah, total_cost, payment_status, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', NOW(), $8)`,
        [extensionId, userId, subscriptionId, dbOrder.order_id, captureId, extensionAmountMah, dbOrder.amount, expiresAt]
    );

    // Update user's daily quota balance (add to borrowed_mah_today)
    await client.query(
        `UPDATE user_subscription 
         SET borrowed_mah_today = COALESCE(borrowed_mah_today, 0) + $1, updated_at = NOW()
         WHERE user_id = $2`,
        [extensionAmountMah, userId]
    );

    return {
        status: 'COMPLETED',
        extensionId,
        message: 'Quota extension purchased successfully',
        addedQuota: extensionAmountMah
    };
}

/**
 * Handle webhook payment completed event
 * @param {object} pool - The database pool
 * @param {string} orderId - The PayPal order ID
 * @param {object} captureData - The PayPal capture response
 */
async function processWebhookPaymentCompleted(pool, orderId, captureData) {
    // Get order to find user
    const orderResult = await pool.query(
        `SELECT * FROM paypal_orders WHERE order_id = $1`,
        [orderId]
    );

    if (orderResult.rows.length === 0) {
        console.log('Webhook: Order not found for', orderId);
        return { processed: false, reason: 'Order not found' };
    }

    const dbOrder = orderResult.rows[0];

    // Skip if already completed
    if (dbOrder.status === 'COMPLETED') {
        console.log('Webhook: Order already completed', orderId);
        return { processed: false, reason: 'Already completed' };
    }

    // Process the payment
    const result = await processSuccessfulPayment(pool, orderId, captureData, dbOrder.user_id);
    return { processed: true, ...result };
}

/**
 * Handle payment denied event from webhook
 * @param {object} pool - The database pool
 * @param {string} orderId - The PayPal order ID
 */
async function processPaymentDenied(pool, orderId) {
    await pool.query(
        `UPDATE paypal_orders SET status = 'DECLINED', updated_at = NOW() WHERE order_id = $1`,
        [orderId]
    );
    
    return { status: 'DECLINED' };
}

/**
 * Check if webhook event was already processed
 * @param {object} pool - The database pool
 * @param {string} eventId - The PayPal event ID
 * @returns {boolean} True if already processed
 */
async function isWebhookProcessed(pool, eventId) {
    const result = await pool.query(
        `SELECT id FROM webhooks_processed WHERE event_id = $1`,
        [eventId]
    );
    
    return result.rows.length > 0;
}

/**
 * Mark webhook as processed
 * @param {object} pool - The database pool
 * @param {string} eventId - The PayPal event ID
 * @param {string} eventType - The PayPal event type
 */
async function markWebhookProcessed(pool, eventId, eventType) {
    await pool.query(
        `INSERT INTO webhooks_processed (event_id, event_type, processed_at)
         VALUES ($1, $2, NOW())`,
        [eventId, eventType]
    );
}

module.exports = {
    getTierPricing,
    getQuotaExtensionPricing,
    logPaymentEvent,
    processSuccessfulPayment,
    processWebhookPaymentCompleted,
    processPaymentDenied,
    isWebhookProcessed,
    markWebhookProcessed
};
