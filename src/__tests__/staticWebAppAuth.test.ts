/**
 * Test for Azure Static Web Apps authentication integration
 */
import { staticWebAppAuthService } from '../services/staticWebAppAuthService';

// Mock fetch for testing
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Azure Static Web Apps Auth Service', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    // Mock window.location.href setter
    delete (window as any).location;
    (window as any).location = { href: '' };
  });

  describe('getUser', () => {
    it('should return user data when authenticated', async () => {
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
    });

    it('should return null when not authenticated', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401
      });

      const user = await staticWebAppAuthService.getUser();

      expect(user).toBeNull();
    });

    it('should return null when no clientPrincipal', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('application/json')
        },
        json: async () => ({})
      });

      const user = await staticWebAppAuthService.getUser();

      expect(user).toBeNull();
    });
  });

  describe('isAuthenticated', () => {
    it('should return true when user exists', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('application/json')
        },
        json: async () => ({
          clientPrincipal: {
            identityProvider: 'aad',
            userId: 'test-user-id'
          }
        })
      });

      const isAuth = await staticWebAppAuthService.isAuthenticated();

      expect(isAuth).toBe(true);
    });

    it('should return false when user does not exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401
      });

      const isAuth = await staticWebAppAuthService.isAuthenticated();

      expect(isAuth).toBe(false);
    });
  });

  describe('login', () => {
    it('should redirect to Azure Static Web Apps login endpoint with default redirect', () => {
      staticWebAppAuthService.login();

      expect(window.location.href).toBe('/.auth/login/aad?post_login_redirect_uri=%2Fwelcome');
    });

    it('should redirect with custom redirect URL', () => {
      staticWebAppAuthService.login('/dashboard');

      expect(window.location.href).toBe('/.auth/login/aad?post_login_redirect_uri=%2Fdashboard');
    });
  });

  describe('logout', () => {
    it('should redirect to Azure Static Web Apps logout endpoint', () => {
      staticWebAppAuthService.logout();

      expect(window.location.href).toBe('/.auth/logout');
    });
  });
});