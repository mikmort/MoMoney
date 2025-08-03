import { useMsal } from '@azure/msal-react';
import { skipAuthentication } from '../config/devConfig';

// Simple hook that works for both modes
export const useAppAuth = () => {
  const { instance, accounts } = useMsal();

  if (skipAuthentication) {
    // In development mode, return mock data
    return {
      isAuthenticated: true,
      user: {
        displayName: 'Development User',
        email: 'dev@momoney.app'
      },
      account: null,
      logout: () => {
        console.log('Development logout - would redirect to login page');
        window.location.reload();
      },
      instance
    };
  }

  // Production mode with real MSAL
  return {
    isAuthenticated: accounts.length > 0,
    user: null,
    account: accounts[0] || null,
    logout: () => instance.logoutPopup(),
    instance
  };
};
