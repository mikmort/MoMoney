/**
 * Utility to detect if the application is running in Azure Static Web Apps
 */

/**
 * Check if the application is running in Azure Static Web Apps environment
 * Azure Static Web Apps provides built-in authentication endpoints like /.auth/me
 */
export const isAzureStaticWebApps = (): boolean => {
  // In development, never use Azure Static Web Apps auth
  if (process.env.NODE_ENV === 'development') {
    return false;
  }

  // Check for Azure Static Web Apps specific environment indicators
  // Azure Static Web Apps often have a specific hostname pattern
  const hostname = window.location.hostname;
  
  // Azure Static Web Apps typically use .azurestaticapps.net domain
  if (hostname.includes('.azurestaticapps.net')) {
    return true;
  }

  // Additional checks could be added here for custom domains
  // For now, we'll also check if we can access the /.auth/me endpoint
  // This is a more reliable way to detect Azure Static Web Apps
  
  return false;
};

/**
 * Asynchronously check if Azure Static Web Apps authentication is available
 * by testing the /.auth/me endpoint
 */
export const checkAzureStaticWebAppsAuth = async (): Promise<boolean> => {
  // In development, never use Azure Static Web Apps auth
  if (process.env.NODE_ENV === 'development') {
    return false;
  }

  try {
    // Try to fetch from the /.auth/me endpoint
    const response = await fetch('/.auth/me', {
      method: 'GET',
      credentials: 'same-origin'
    });
    
    // If we get a response (even 401), it means Azure Static Web Apps auth is available
    // Azure Static Web Apps returns JSON even for unauthenticated requests
    const contentType = response.headers.get('content-type');
    return contentType?.includes('application/json') || false;
  } catch (error) {
    // If there's an error accessing the endpoint, it's likely not Azure Static Web Apps
    return false;
  }
};
