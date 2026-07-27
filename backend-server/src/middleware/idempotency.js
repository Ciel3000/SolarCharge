// backend-server/middleware/idempotency.js
// Idempotency middleware to prevent duplicate payment processing

const { v4: uuidv4 } = require('uuid');

/**
 * Idempotency middleware
 * - Generates or reads X-Idempotency-Key header
 * - Checks for existing completed orders with same key
 * - Attaches idempotencyKey to request for downstream use
 */
function idempotencyMiddleware(pool) {
    return async (req, res, next) => {
        try {
            // Get or generate idempotency key
            let idempotencyKey = req.headers['x-idempotency-key'];
            
            if (!idempotencyKey) {
                // Generate new UUID if not provided
                idempotencyKey = uuidv4();
                req.idempotencyKey = idempotencyKey;
                req.idempotencyKeyGenerated = true;
            } else {
                req.idempotencyKey = idempotencyKey;
                req.idempotencyKeyGenerated = false;
            }

            // Check if we have a completed order with this idempotency key
            if (pool) {
                const existingOrder = await pool.query(
                    `SELECT id, order_id, status FROM paypal_orders 
                     WHERE idempotency_key = ?`,
                    [idempotencyKey]
                );

                if (existingOrder[0].length > 0) {
                    const order = existingOrder[0][0];
                    
                    // If order is already completed, return cached response
                    if (order.status === 'COMPLETED') {
                        console.log('Idempotency: Returning cached response for key', idempotencyKey);
                        return res.status(200).json({
                            status: 'COMPLETED',
                            orderId: order.order_id,
                            cached: true,
                            message: 'Order already processed'
                        });
                    }
                }
            }

            // Continue to the next middleware
            next();
            
        } catch (error) {
            console.error('Idempotency middleware error:', error);
            // On error, allow request to continue (fail-open for better UX)
            next();
        }
    };
}

module.exports = idempotencyMiddleware;
