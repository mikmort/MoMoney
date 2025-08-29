/**
 * @deprecated - No longer using MSAL authentication
 * This file is kept for reference but is not used by the application.
 * Azure Static Web Apps now handles authentication via /.auth endpoints.
 */

import { Configuration, PopupRequest } from '@azure/msal-browser';
import { defaultConfig } from './appConfig';

// DEPRECATED: MSAL configuration - no longer used
export const msalConfig: Configuration = {
  auth: {
    clientId: defaultConfig.azure.msal.clientId,
    authority: defaultConfig.azure.msal.authority,
    redirectUri: defaultConfig.azure.msal.redirectUri,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
};

// DEPRECATED: Scopes for accessing Microsoft Graph API - no longer used  
export const loginRequest: PopupRequest = {
  scopes: ['openid', 'profile', 'User.Read'],
};

// DEPRECATED: Additional scopes if needed for Graph API - no longer used
export const graphConfig = {
  graphMeEndpoint: 'https://graph.microsoft.com/v1.0/me',
};
