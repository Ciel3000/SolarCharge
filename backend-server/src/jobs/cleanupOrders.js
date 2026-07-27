// backend-server/jobs/cleanupOrders.js
// Hourly cron job to clean up expired PayPal orders

/**
 * Cleanup expired PayPal orders
 * Updates status to 'FAILED' for orders that:
 * - Have status 'CREATED'
 * - Have expired (expires_at < NOW())
 * 
 * @param {object} pool - The database pool
 * @returns {object} Result with count of updated orders
 */
async function cleanupExpiredOrders(pool) {
    try {
        // Find expired orders
        const expiredOrders = await pool.query(
            `SELECT id, order_id, user_id, created_at, expires_at 
             FROM paypal_orders 
             WHERE status = 'CREATED' AND expires_at < NOW()`
        );

        if (expiredOrders[0].length > 0) {
            console.log(`Found ${expiredOrders[0].length} expired orders to clean up`);
        }

        // Update expired orders to FAILED status
        const result = await pool.query(
            `UPDATE paypal_orders 
             SET status = 'FAILED', error_message = 'Order expired - cleaned up by cron', updated_at = NOW()
             WHERE status = 'CREATED' AND expires_at < NOW()`
        );

        console.log(`Cleanup: Marked ${result.rowCount} orders as FAILED`);

        // Log cleanup activity
        if (result.rowCount > 0) {
            await pool.query(
                `INSERT INTO payment_logs (user_id, action, payload, response, status)
                 VALUES (NULL, 'CRON_CLEANUP', ?, ?, 'SUCCESS')`,
                [JSON.stringify({ cleaned: result.rowCount }), JSON.stringify({ timestamp: new Date().toISOString() })]
            );
        }

        return {
            processed: result.rowCount,
            timestamp: new Date().toISOString()
        };

    } catch (error) {
        console.error('Cleanup error:', error);
        
        // Log error
        try {
            await pool.query(
                `INSERT INTO payment_logs (user_id, action, payload, response, status)
                 VALUES (NULL, 'CRON_CLEANUP_ERROR', ?, ?, 'FAILED')`,
                [JSON.stringify({ error: error.message }), JSON.stringify({ timestamp: new Date().toISOString() })]
            );
        } catch (logError) {
            console.error('Failed to log cleanup error:', logError);
        }

        throw error;
    }
}

/**
 * Start the cleanup cron job
 * @param {object} pool - The database pool
 * @param {number} intervalMs - Interval in milliseconds (default: 1 hour)
 */
function startCleanupJob(pool, intervalMs = 60 * 60 * 1000) {
    console.log(`Starting cleanup job with interval: ${intervalMs}ms`);
    
    // Run immediately on start
    cleanupExpiredOrders(pool).catch(err => {
        console.error('Initial cleanup failed:', err);
    });

    // Then run on interval
    const intervalId = setInterval(() => {
        cleanupExpiredOrders(pool).catch(err => {
            console.error('Scheduled cleanup failed:', err);
        });
    }, intervalMs);

    return {
        stop: () => {
            clearInterval(intervalId);
            console.log('Cleanup job stopped');
        }
    };
}

module.exports = {
    cleanupExpiredOrders,
    startCleanupJob
};
