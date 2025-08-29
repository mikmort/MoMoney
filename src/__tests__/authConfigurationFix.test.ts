/**
 * Test to verify Azure Static Web Apps authentication configuration fixes
 */
import { staticWebAppAuthService } from '../services/staticWebAppAuthService';

// Mock fetch for testing
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Azure Static Web Apps Auth Configuration Fix', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    // Mock window.location.href setter
    delete (window as any).location;
    (window as any).location = { href: '' };
  });

  describe('login redirect fix', () => {
    it('should redirect to correct Azure Static Web Apps login endpoint', () => {
      staticWebAppAuthService.login('/');
      
      // Verify redirect to Azure Static Web Apps AAD login endpoint with correct post-login redirect
      expect(window.location.href).toBe('/.auth/login/aad?post_login_redirect_uri=%2F');
    });

    it('should handle custom redirect URLs correctly', () => {
      staticWebAppAuthService.login('/dashboard');
      
      // Verify custom redirect URL is properly encoded
      expect(window.location.href).toBe('/.auth/login/aad?post_login_redirect_uri=%2Fdashboard');
    });

    it('should use default redirect when no URL provided', () => {
      staticWebAppAuthService.login();
      
      // Verify default /welcome redirect is used
      expect(window.location.href).toBe('/.auth/login/aad?post_login_redirect_uri=%2Fwelcome');
    });
  });

  describe('authentication check', () => {
    it('should handle /.auth/me endpoint correctly when user is authenticated', async () => {
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

      mockFetch.mockResolvedValue({
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('application/json')
        },
        json: async () => mockUserData
      });

      const user = await staticWebAppAuthService.getUser();
      const isAuth = await staticWebAppAuthService.isAuthenticated();

      expect(user).toEqual(mockUserData.clientPrincipal);
      expect(isAuth).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('/.auth/me');
    });

    it('should handle /.auth/me endpoint correctly when user is not authenticated', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401
      });

      const isAuth = await staticWebAppAuthService.isAuthenticated();

      expect(isAuth).toBe(false);
      expect(mockFetch).toHaveBeenCalledWith('/.auth/me');
    });
  });
});