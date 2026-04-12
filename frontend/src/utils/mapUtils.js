/**
 * Utility functions for map navigation
 */

/**
 * Generate Google Maps URL with precise coordinates or fallback to location search
 * @param {string} locationDescription - Fallback location description
 * @param {number} latitude - Station latitude
 * @param {number} longitude - Station longitude
 * @param {number} zoom - Map zoom level (default: 18 for precise location)
 * @returns {string} Google Maps URL
 */
export const generateGoogleMapsUrl = (locationDescription, latitude, longitude, zoom = 18) => {
  // Use precise coordinates if available
  if (latitude && longitude) {
    return `https://www.google.com/maps?q=${latitude},${longitude}&z=${zoom}`;
  }
  
  // Fallback to location description search
  const encodedLocation = encodeURIComponent(locationDescription);
  return `https://www.google.com/maps/search/?api=1&query=${encodedLocation}`;
};

/**
 * Open Google Maps in a new tab with precise coordinates
 * @param {string} locationDescription - Fallback location description
 * @param {number} latitude - Station latitude
 * @param {number} longitude - Station longitude
 * @param {number} zoom - Map zoom level (default: 18 for precise location)
 */
export const openGoogleMaps = (locationDescription, latitude, longitude, zoom = 18) => {
  const url = generateGoogleMapsUrl(locationDescription, latitude, longitude, zoom);
  window.open(url, '_blank');
};

/**
 * Check if coordinates are valid
 * @param {number} latitude - Station latitude
 * @param {number} longitude - Station longitude
 * @returns {boolean} True if coordinates are valid
 */
export const isValidCoordinates = (latitude, longitude) => {
  return latitude && longitude && 
         typeof latitude === 'number' && 
         typeof longitude === 'number' &&
         latitude >= -90 && latitude <= 90 &&
         longitude >= -180 && longitude <= 180;
};
