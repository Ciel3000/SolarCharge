// frontend/src/utils/apiErrorHandler.js

// Global API error handler for expired sessions
export const handleApiError = (error, authContext) => {
  console.error('API Error:', error);
  
  // Check if it's an authentication error
  if (error.status === 401 || error.message?.includes('unauthorized') || error.message?.includes('expired')) {
    console.log('Session expired detected in API call');
    if (authContext && authContext.handleSessionTimeout) {
      authContext.handleSessionTimeout();
    }
    return { isAuthError: true, message: 'Session expired. Please log in again.' };
  }
  
  return { isAuthError: false, message: error.message || 'An error occurred' };
};

// Wrapper for fetch calls to handle auth errors
export const apiFetch = async (url, options = {}, authContext) => {
  try {
    const response = await fetch(url, options);
    
    if (response.status === 401) {
      console.log('Unauthorized response detected');
      if (authContext && authContext.handleSessionTimeout) {
        authContext.handleSessionTimeout();
      }
      throw new Error('Session expired. Please log in again.');
    }
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response;
  } catch (error) {
    const handledError = handleApiError(error, authContext);
    throw new Error(handledError.message);
  }
};
