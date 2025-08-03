import { Configuration, PopupRequest } from '@azure/msal-browser';
import { defaultConfig } from './appConfig';

// MSAL configuration
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

// Scopes for accessing Microsoft Graph API
export const loginRequest: PopupRequest = {
  scopes: ['openid', 'profile', 'User.Read'],
};

// Additional scopes if needed for Graph API
export const graphConfig = {
  graphMeEndpoint: 'https://graph.microsoft.com/v1.0/me',
};
