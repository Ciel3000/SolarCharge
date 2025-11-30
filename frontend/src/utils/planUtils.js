/**
 * Utility functions for subscription plan management
 */

/**
 * Filter out discontinued plans from a list of plans
 * @param {Array} plans - Array of subscription plans
 * @returns {Array} Filtered array without discontinued plans
 */
export const filterActivePlans = (plans) => {
  if (!Array.isArray(plans)) {
    return [];
  }
  
  return plans.filter(plan => 
    !plan.plan_name?.includes('(DISCONTINUED)')
  );
};

/**
 * Check if a plan is discontinued
 * @param {Object} plan - Subscription plan object
 * @returns {boolean} True if the plan is discontinued
 */
export const isPlanDiscontinued = (plan) => {
  return plan?.plan_name?.includes('(DISCONTINUED)') || false;
};

/**
 * Get plan status based on plan data
 * @param {Object} plan - Subscription plan object
 * @returns {string} Plan status ('active' or 'discontinued')
 */
export const getPlanStatus = (plan) => {
  return isPlanDiscontinued(plan) ? 'discontinued' : 'active';
};
