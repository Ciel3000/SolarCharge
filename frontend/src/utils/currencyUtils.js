/**
 * Currency utility functions
 * Standardized to use PHP (Philippine Peso)
 */

export const CURRENCY_CODE = 'PHP';
export const CURRENCY_SYMBOL = '₱';
export const CURRENCY_LOCALE = 'en-PH';

/**
 * Format a number as Philippine Peso currency
 * @param {number} amount - The amount to format
 * @returns {string} Formatted currency string (e.g., "₱1,234.56")
 */
export const formatCurrency = (amount) => {
  return new Intl.NumberFormat(CURRENCY_LOCALE, {
    style: 'currency',
    currency: CURRENCY_CODE,
  }).format(amount || 0);
};

/**
 * Format a number as PHP currency without decimal places (for whole numbers)
 * @param {number} amount - The amount to format
 * @returns {string} Formatted currency string (e.g., "₱1,235")
 */
export const formatCurrencyWhole = (amount) => {
  return new Intl.NumberFormat(CURRENCY_LOCALE, {
    style: 'currency',
    currency: CURRENCY_CODE,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount || 0);
};

/**
 * Get the currency symbol
 * @returns {string} The currency symbol (₱)
 */
export const getCurrencySymbol = () => CURRENCY_SYMBOL;