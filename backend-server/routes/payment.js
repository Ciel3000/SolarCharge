// backend-server/routes/payment.js
// Payment endpoints for PayPal Checkout API integration

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { paypalClient, createOrderRequest } = require('../config/paypal');
const { 
    getTierPricing, 
    getQuotaExtensionPricing,
    logPaymentEvent,
    processSuccessfulPayment,
    processWebhookPaymentCompleted,
    processPaymentDenied,
    isWebhookProcessed,
    markWebhookProcessed
} = require('../services/paymentService');
const router = express.Router();

// Import pool directly
const pool = require('../pool');

// Apply JSON parsing for non-webhook routes
router.use(express.json());

/**
 * POST /api/payment/create-order
 * Create a new PayPal order
 * Auth required
 */
router.post('/create-order', async (req, res) => {
    const { planId, paymentType, extensionAmount } = req.body;
    const userId = req.user?.user_id;

    console.log('Create order request:', { planId, paymentType, userId });

    // Validate required fields
    if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    if (!paymentType) {
        return res.status(400).json({ error: 'Payment type is required' });
    }

    if (paymentType === 'subscription' && !planId) {
        return res.status(400).json({ error: 'Plan ID is required for subscriptions' });
    }

    try {
        let amount, currency, description, plan;

        if (paymentType === 'subscription') {
            // Get pricing from database - NEVER trust frontend price
            const pricing = await getTierPricing(pool, planId);
            
            if (!pricing.requiresPayment) {
                // Free tier - activate without payment
                await logPaymentEvent(pool, userId, 'FREE_TIER_ACTIVATION', { planId }, { requiresPayment: false }, 'SUCCESS');
                return res.json({
                    requiresPayment: false,
                    message: 'Free tier activated',
                    plan: pricing.plan
                });
            }

            plan = pricing.plan;
            amount = plan.price.toString();
            currency = 'PHP';
            description = `${plan.plan_name} - Subscription`;
        } else if (paymentType === 'quota_extension') {
            // Get quota extension pricing from database
            const pricing = await getQuotaExtensionPricing(pool, 'direct_purchase');
            
            amount = pricing.price_per_transaction.toString();
            currency = 'PHP';
            description = `${pricing.extension_amount_mah} mAh Quota Extension`;
        } else {
            return res.status(400).json({ error: 'Invalid payment type' });
        }

        // Generate internal reference ID for webhook correlation
        const internalOrderId = uuidv4();
        
        // Create PayPal order
        const orderRequest = createOrderRequest(amount, currency, description, internalOrderId);
        
        const paypal = paypalClient();
        const request = new paypal.orders.OrdersCreateRequest();
        request.prefer('return=representation');
        request.requestBody(orderRequest);

        let paypalOrder;
        try {
            paypalOrder = await paypal.execute(request);
        } catch (ppError) {
            console.error('PayPal create order error:', ppError);
            await logPaymentEvent(pool, userId, 'PAYPAL_CREATE_ERROR', { planId, paymentType }, { error: ppError.message }, 'FAILED');
            return res.status(500).json({ error: 'Failed to create PayPal order' });
        }

        const paypalOrderId = paypalOrder.result.id;
        
        // Calculate expiry (3 hours from now)
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 3);

        // Get or create idempotency key
        const idempotencyKey = req.idempotencyKey || uuidv4();

        // Save to paypal_orders table
        await pool.query(
            `INSERT INTO paypal_orders (id, user_id, order_id, payment_type, plan_id, amount, currency, status, idempotency_key, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'CREATED', $8, $9)`,
            [internalOrderId, userId, paypalOrderId, paymentType, planId || null, amount, currency, idempotencyKey, expiresAt]
        );

        await logPaymentEvent(pool, userId, 'ORDER_CREATED', { 
            planId, 
            paymentType, 
            amount 
        }, { 
            orderId: paypalOrderId,
            status: 'CREATED'
        }, 'SUCCESS');

        res.json({
            orderId: paypalOrderId,
            status: 'CREATED',
            internalOrderId
        });

    } catch (error) {
        console.error('Create order error:', error);
        await logPaymentEvent(pool, userId, 'CREATE_ORDER_ERROR', { planId, paymentType }, { error: error.message }, 'FAILED');
        res.status(500).json({ error: error.message || 'Failed to create order' });
    }
});

/**
 * POST /api/payment/capture-order
 * Capture a PayPal order after user approval
 * Auth required
 */
router.post('/capture-order', async (req, res) => {
    const pool = require('../pool');
    const { orderId } = req.body;
    const userId = req.user?.user_id;

    console.log('Capture order request:', { orderId, userId });

    // Validate required fields
    if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    if (!orderId) {
        return res.status(400).json({ error: 'Order ID is required' });
    }

    try {
        // Verify order exists and belongs to user
        const orderResult = await pool.query(
            `SELECT * FROM paypal_orders WHERE order_id = $1`,
            [orderId]
        );

        if (orderResult.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const dbOrder = orderResult.rows[0];

        // Verify ownership
        if (dbOrder.user_id !== userId) {
            await logPaymentEvent(pool, userId, 'CAPTURE_UNAUTHORIZED', { orderId }, { error: 'Unauthorized' }, 'FAILED');
            return res.status(403).json({ error: 'Order does not belong to user' });
        }

        // Check if already completed
        if (dbOrder.status === 'COMPLETED') {
            return res.json({
                status: 'COMPLETED',
                message: 'Order already completed'
            });
        }

        // Check if expired
        if (new Date(dbOrder.expires_at) < new Date()) {
            await pool.query(
                `UPDATE paypal_orders SET status = 'FAILED', error_message = 'Order expired' WHERE order_id = $1`,
                [orderId]
            );
            return res.status(400).json({ error: 'Order has expired' });
        }

        // Call PayPal Capture API
        const paypal = paypalClient();
        const captureRequest = new paypal.orders.OrdersCaptureRequest(orderId);
        captureRequest.requestBody({});

        let captureResult;
        try {
            captureResult = await paypal.execute(captureRequest);
        } catch (ppError) {
            console.error('PayPal capture error:', ppError);
            await pool.query(
                `UPDATE paypal_orders SET status = 'FAILED', error_message = $1 WHERE order_id = $2`,
                [ppError.message, orderId]
            );
            await logPaymentEvent(pool, userId, 'PAYPAL_CAPTURE_ERROR', { orderId }, { error: ppError.message }, 'FAILED');
            return res.status(500).json({ error: 'Payment capture failed' });
        }

        const capture = captureResult.result;
        
        // Verify capture status
        if (capture.status !== 'COMPLETED') {
            const status = capture.status === 'DECLINED' ? 'DECLINED' : 'FAILED';
            await pool.query(
                `UPDATE paypal_orders SET status = $1, error_message = $2 WHERE order_id = $3`,
                [status, capture.status, orderId]
            );
            await logPaymentEvent(pool, userId, 'CAPTURE_NOT_COMPLETED', { orderId }, { status: capture.status }, 'FAILED');
            return res.status(400).json({ 
                error: 'Payment not completed', 
                status: capture.status 
            });
        }

        // Fraud Check: Verify amount matches
        const capturedAmount = parseFloat(
            capture.purchase_units[0].payments.captures[0].amount.value
        );
        const expectedAmount = parseFloat(dbOrder.amount);
        const tolerance = 0.001;

        if (Math.abs(capturedAmount - expectedAmount) > tolerance) {
            await pool.query(
                `UPDATE paypal_orders SET status = 'FAILED', error_message = 'Amount mismatch' WHERE order_id = $1`,
                [orderId]
            );
            await logPaymentEvent(pool, userId, 'FRAUD_ALERT_AMOUNT_MISMATCH', { 
                orderId 
            }, { 
                captured: capturedAmount, 
                expected: expectedAmount 
            }, 'FAILED');
            return res.status(400).json({ error: 'Payment validation failed - amount mismatch' });
        }

        // Process successful payment atomically
        const result = await processSuccessfulPayment(pool, orderId, capture, userId);

        await logPaymentEvent(pool, userId, 'PAYMENT_COMPLETED', { orderId }, result, 'SUCCESS');

        res.json(result);

    } catch (error) {
        console.error('Capture order error:', error);
        await logPaymentEvent(pool, userId, 'CAPTURE_ORDER_ERROR', { orderId }, { error: error.message }, 'FAILED');
        res.status(500).json({ error: error.message || 'Failed to capture order' });
    }
});

/**
 * POST /api/payment/webhook
 * Handle PayPal webhooks
 * No user auth - uses PayPal signature verification
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const pool = require('../pool');
    
    // Get PayPal headers
    const eventId = req.headers['paypal-event-id'];
    const transmissionId = req.headers['paypal-transmission-sig'];
    const timestamp = req.headers['paypal-transmission-time'];
    const webhookId = req.headers['paypal-webhook-id'];

    console.log('Webhook received:', { eventId, transmissionId, timestamp });

    // Basic validation
    if (!eventId) {
        console.error('Webhook: Missing event ID');
        return res.status(400).json({ error: 'Missing event ID' });
    }

    try {
        // Parse webhook body (it's a Buffer)
        const rawBody = req.body.toString('utf8');
        const event = JSON.parse(rawBody);
        const eventType = event.event_type;

        // Idempotency check
        const alreadyProcessed = await isWebhookProcessed(pool, eventId);
        if (alreadyProcessed) {
            console.log('Webhook: Already processed', eventId);
            return res.json({ received: true, status: 'already_processed' });
        }

        // Handle different event types
        let result;
        
        switch (eventType) {
            case 'PAYMENT.CAPTURE.COMPLETED':
                const orderId = event.resource?.supplementary_data?.related_ids?.order_id 
                    || event.resource?.custom_id
                    || event.resource?.invoice_number;
                
                if (orderId) {
                    result = await processWebhookPaymentCompleted(pool, orderId, event.resource);
                    await logPaymentEvent(pool, null, 'WEBHOOK_PAYMENT_COMPLETED', { orderId, eventId }, result, 'SUCCESS');
                }
                break;

            case 'PAYMENT.CAPTURE.DENIED':
                const deniedOrderId = event.resource?.supplementary_data?.related_ids?.order_id
                    || event.resource?.custom_id;
                
                if (deniedOrderId) {
                    result = await processPaymentDenied(pool, deniedOrderId);
                    await logPaymentEvent(pool, null, 'WEBHOOK_PAYMENT_DENIED', { orderId: deniedOrderId, eventId }, result, 'SUCCESS');
                }
                break;

            case 'PAYMENT.CAPTURE.REFUNDED':
                console.log('Webhook: Payment refunded', event.resource);
                // Could implement refund handling here
                break;

            default:
                console.log('Webhook: Unhandled event type', eventType);
        }

        // Mark webhook as processed (idempotency)
        await markWebhookProcessed(pool, eventId, eventType);

        res.json({ received: true });

    } catch (error) {
        console.error('Webhook error:', error);
        await logPaymentEvent(pool, null, 'WEBHOOK_ERROR', { eventId }, { error: error.message }, 'FAILED');
        // Still return 200 to prevent PayPal from retrying
        res.json({ received: true, error: 'Processing error' });
    }
});

/**
 * GET /api/payment/status/:orderId
 * Check payment status (for debugging)
 */
router.get('/status/:orderId', async (req, res) => {
    const pool = require('../pool');
    const { orderId } = req.params;
    const userId = req.user?.user_id;

    if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const result = await pool.query(
            `SELECT order_id, payment_type, amount, currency, status, paypal_capture_id, created_at
             FROM paypal_orders 
             WHERE order_id = $1 AND user_id = $2`,
            [orderId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Get status error:', error);
        res.status(500).json({ error: 'Failed to get order status' });
    }
});

module.exports = router;
