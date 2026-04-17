// backend-server/config/paypal.js
// PayPal Checkout API client configuration

const checkoutNodeJssdk = require('@paypal/checkout-server-sdk');

// Load environment variables
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox';

/**
 * Creates an PayPal HTTP client for API calls
 * Uses sandbox/live mode based on environment
 */
function paypalClient() {
    const clientId = PAYPAL_CLIENT_ID;
    const clientSecret = PAYPAL_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
        console.error('PayPal configuration missing: PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set');
        throw new Error('PayPal client configuration is incomplete');
    }

    // Production or Sandbox environment
    let environment;
    if (PAYPAL_MODE === 'live') {
        environment = new checkoutNodeJssdk.core.LiveEnvironment(clientId, clientSecret);
    } else {
        environment = new checkoutNodeJssdk.core.SandboxEnvironment(clientId, clientSecret);
    }

    const client = new checkoutNodeJssdk.core.PayPalHttpClient(environment);
    
    // Add orders API access
    client.orders = {
        OrdersCreateRequest: checkoutNodeJssdk.orders.OrdersCreateRequest,
        OrdersCaptureRequest: checkoutNodeJssdk.orders.OrdersCaptureRequest
    };
    
    return client;
}

/**
 * Creates an order request for PayPal
 * @param {string} amount - The amount to charge
 * @param {string} currency - The currency code (default: PHP)
 * @param {string} description - Description of the purchase
 * @param {string} referenceId - Internal reference ID for tracking
 */
function createOrderRequest(amount, currency = 'PHP', description, referenceId) {
    return {
        intent: 'CAPTURE',
        purchase_units: [{
            reference_id: referenceId,
            description: description,
            amount: {
                currency_code: currency,
                value: amount
            }
        }],
        application_context: {
            shipping_preference: 'NO_SHIPPING'
        }
    };
}

module.exports = {
    paypalClient,
    createOrderRequest,
    PAYPAL_MODE,
    PAYPAL_WEBHOOK_ID: process.env.PAYPAL_WEBHOOK_ID
};
