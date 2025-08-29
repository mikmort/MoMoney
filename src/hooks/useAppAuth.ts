import { useState, useEffect } from 'react';
import { staticWebAppAuthService } from '../services/staticWebAppAuthService';
import { skipAuthentication } from '../config/devConfig';

// User object type for the hook's return
interface AppUser {
  displayName: string;
  email: string;
}

// Account object type for compatibility with existing components
interface AppAccount {
  name: string;
  username: string;
}

// Simple hook that works for both modes
export const useAppAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);
  const [account, setAccount] = useState<AppAccount | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        if (skipAuthentication) {
          // In development mode, return mock data
          setIsAuthenticated(true);
          setUser({
            displayName: 'Development User',
            email: 'dev@momoney.app'
          });
          setAccount(null);
          setIsLoading(false);
          return;
        }

        // Production mode with Azure Static Web Apps auth
        const authenticated = await staticWebAppAuthService.isAuthenticated();
        const currentUser = authenticated ? await staticWebAppAuthService.getUser() : null;
        
        setIsAuthenticated(authenticated);
        
        if (currentUser) {
          const displayName = currentUser.userDetails || 'User';
          const email = currentUser.claims?.find(c => c.typ === 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress')?.val || 'unknown@example.com';
          
          setUser({
            displayName,
            email
          });
          
          // Map StaticWebAppUser to AppAccount for compatibility
          setAccount({
            name: displayName,
            username: email
          });
        } else {
          setUser(null);
          setAccount(null);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        setIsAuthenticated(false);
        setUser(null);
        setAccount(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  if (skipAuthentication) {
    // In development mode, return mock data
    return {
      isAuthenticated: true,
      user: {
        displayName: 'Development User',
        email: 'dev@momoney.app'
      },
      account: null,
      isLoading: false,
      logout: () => {
        console.log('Development logout - would redirect to login page');
        window.location.reload();
      },
      instance: null
    };
  }

  // Production mode with Azure Static Web Apps
  return {
    isAuthenticated,
    user,
    account,
    isLoading,
    logout: () => staticWebAppAuthService.logout(),
    instance: null
  };
};
