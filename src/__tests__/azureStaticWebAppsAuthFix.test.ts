/**
 * Test for Azure Static Web Apps authentication integration
 */
import { isAzureStaticWebApps, checkAzureStaticWebAppsAuth } from '../utils/azureStaticWebAppsDetection';
import { staticWebAppAuthService } from '../services/staticWebAppAuthService';

// Mock fetch for testing
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Azure Static Web Apps Authentication Fix', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    // Mock window.location.href setter
    delete (window as any).location;
    (window as any).location = { 
      href: '',
      hostname: 'localhost' 
    };
  });

  describe('isAzureStaticWebApps detection', () => {
    it('should return false for localhost in development', () => {
      process.env.NODE_ENV = 'development';
      (window as any).location.hostname = 'localhost';
      
      const result = isAzureStaticWebApps();
      
      expect(result).toBe(false);
    });

    it('should return true for Azure Static Web Apps hostname in production', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      (window as any).location.hostname = 'gentle-moss-087d9321e.1.azurestaticapps.net';
      
      const result = isAzureStaticWebApps();
      
      expect(result).toBe(true);
      
      // Restore NODE_ENV
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should return false for custom domain in production', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      (window as any).location.hostname = 'momoney.example.com';
      
      const result = isAzureStaticWebApps();
      
      expect(result).toBe(false);
      
      // Restore NODE_ENV
      process.env.NODE_ENV = originalNodeEnv;
    });
  });

  describe('checkAzureStaticWebAppsAuth', () => {
    it('should return false in development mode', async () => {
      process.env.NODE_ENV = 'development';
      
      const result = await checkAzureStaticWebAppsAuth();
      
      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return true when /.auth/me endpoint returns JSON', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('application/json')
        }
      });
      
      const result = await checkAzureStaticWebAppsAuth();
      
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('/.auth/me', {
        method: 'GET',
        credentials: 'same-origin'
      });
      
      // Restore NODE_ENV
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should return false when /.auth/me endpoint returns non-JSON', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('text/html')
        }
      });
      
      const result = await checkAzureStaticWebAppsAuth();
      
      expect(result).toBe(false);
      
      // Restore NODE_ENV
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should return false when /.auth/me endpoint throws error', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      
      const result = await checkAzureStaticWebAppsAuth();
      
      expect(result).toBe(false);
      
      // Restore NODE_ENV
      process.env.NODE_ENV = originalNodeEnv;
    });
  });

  describe('staticWebAppAuthService integration', () => {
    it('should redirect to correct Azure Static Web Apps login endpoint', () => {
      staticWebAppAuthService.login('/');
      
      // Verify redirect to Azure Static Web Apps AAD login endpoint with correct post-login redirect
      expect(window.location.href).toBe('/.auth/login/aad?post_login_redirect_uri=%2F');
    });

    it('should handle authentication check when user is authenticated', async () => {
      const mockUserData = {
        clientPrincipal: {
          identityProvider: 'aad',
          userId: 'test-user-id',
          userDetails: 'Test User',
          userRoles: ['authenticated'],
          claims: [
            {
              typ: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
              val: 'test@example.com'
            }
          ]
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('application/json')
        },
        json: async () => mockUserData
      });

      const user = await staticWebAppAuthService.getUser();

      expect(fetch).toHaveBeenCalledWith('/.auth/me');
      expect(user).toEqual(mockUserData.clientPrincipal);

      // Mock the second call for isAuthenticated which internally calls getUser
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('application/json')
        },
        json: async () => mockUserData
      });

      const isAuthenticated = await staticWebAppAuthService.isAuthenticated();
      expect(isAuthenticated).toBe(true);
    });

    it('should handle authentication check when user is not authenticated', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401
      });

      const user = await staticWebAppAuthService.getUser();

      expect(user).toBeNull();

      // Mock the second call for isAuthenticated
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401
      });

      const isAuthenticated = await staticWebAppAuthService.isAuthenticated();
      expect(isAuthenticated).toBe(false);
    });
  });
});
