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
    const [rows] = await pool.query(
        `SELECT plan_id, plan_name, price, daily_mah_limit, duration_type, duration_value
         FROM subscription_plans 
         WHERE plan_id = ? AND is_active = true`,
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
    const [rows] = await pool.query(
        `SELECT id, extension_type, price_per_transaction, extension_amount_mah, is_active
         FROM quota_extension_pricing
         WHERE extension_type = ? AND is_active = true`,
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
    try {
        await pool.query(
            `INSERT INTO payment_logs (user_id, action, payload, response, status)
             VALUES (?, ?, ?, ?, ?)`,
            [
                userId || null, 
                action || 'unknown', 
                JSON.stringify(payload || {}), 
                JSON.stringify(response || {}), 
                status || 'unknown'
            ]
        );
    } catch (err) {
        console.error('logPaymentEvent error:', err.message);
    }
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
    const client = await pool.getConnection();
    
    try {
        await client.query('BEGIN');

        // Get the order from paypal_orders
        const orderResult = await client.query(
            `SELECT * FROM paypal_orders WHERE order_id = ?`,
            [orderId]
        );

        if (orderResult[0].length === 0) {
            throw new Error('Order not found');
        }

        const dbOrder = orderResult[0][0];

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
             SET status = 'COMPLETED', paypal_capture_id = ?, updated_at = NOW()
             WHERE order_id = ?`,
            [paypalCaptureId, orderId]
        );

        // Insert into payments table
        const paymentId = uuidv4();
        await client.query(
            `INSERT INTO payments (id, user_id, paypal_order_id, payment_capture_id, payment_type, amount, currency, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [paymentId, userId, orderId, paypalCaptureId, dbOrder.payment_type, dbOrder.amount, dbOrder.currency || 'PHP', 'completed']
        );

        let result;

        // Branch on payment_type
        if (dbOrder.payment_type === 'subscription') {
            result = await processSubscriptionPayment(client, userId, dbOrder, paypalCaptureId);
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
        `SELECT * FROM subscription_plans WHERE plan_id = ?`,
        [dbOrder.plan_id]
    );

    if (planResult[0].length === 0) {
        throw new Error('Plan not found');
    }

    const plan = planResult[0][0];
    
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

    // Insert new subscription record (multiple active subscriptions now allowed)
    await client.query(
        `INSERT INTO user_subscription 
         (user_subscription_id, user_id, plan_id, is_active, start_date, end_date)
         VALUES (?, ?, ?, true, ?, ?)`,
        [subscriptionId, userId, dbOrder.plan_id, startDate.toISOString(), endDate.toISOString()]
    );

    return {
        status: 'COMPLETED',
        subscriptionId,
        message: 'Subscription activated successfully'
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
        `SELECT * FROM paypal_orders WHERE order_id = ?`,
        [orderId]
    );

    if (orderResult[0].length === 0) {
        console.log('Webhook: Order not found for', orderId);
        return { processed: false, reason: 'Order not found' };
    }

    const dbOrder = orderResult[0][0];

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
        `UPDATE paypal_orders SET status = 'DECLINED', updated_at = NOW() WHERE order_id = ?`,
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
        `SELECT id FROM webhooks_processed WHERE event_id = ?`,
        [eventId]
    );
    
    return result[0].length > 0;
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
         VALUES (?, ?, NOW())`,
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
