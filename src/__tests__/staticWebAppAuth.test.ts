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

    it('should log helpful development mode message for non-JSON response when NODE_ENV is development', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      try {
        process.env.NODE_ENV = 'development';
        
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: {
            get: jest.fn().mockReturnValue('text/html')
          }
        });

        const user = await staticWebAppAuthService.getUser();

        expect(user).toBeNull();
        expect(consoleSpy).toHaveBeenCalledWith(
          '/.auth/me endpoint returned non-JSON response - running in local development mode. Azure Static Web Apps authentication is not available locally. Consider setting REACT_APP_SKIP_AUTH=true for development.'
        );
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
        consoleSpy.mockRestore();
      }
    });

    it('should log helpful development mode message for JSON parse error when NODE_ENV is development', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      try {
        process.env.NODE_ENV = 'development';
        
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: {
            get: jest.fn().mockReturnValue('application/json') // Mock as JSON to bypass content-type check
          },
          json: async () => {
            throw new SyntaxError('Unexpected token < in JSON at position 0');
          }
        });

        const user = await staticWebAppAuthService.getUser();

        expect(user).toBeNull();
        expect(consoleSpy).toHaveBeenCalledWith(
          '/.auth/me endpoint returned HTML instead of JSON - running in local development mode. Azure Static Web Apps authentication is not available locally. Consider setting REACT_APP_SKIP_AUTH=true for development.'
        );
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
        consoleSpy.mockRestore();
      }
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

    it('should log helpful development mode message when NODE_ENV is development', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      try {
        process.env.NODE_ENV = 'development';
        staticWebAppAuthService.login();

        expect(consoleSpy).toHaveBeenCalledWith(
          'Azure Static Web Apps authentication is not available in local development mode. To test authentication locally, set REACT_APP_SKIP_AUTH=true in your .env file to use development mode authentication.'
        );
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
        consoleSpy.mockRestore();
      }
    });
  });

  describe('logout', () => {
    it('should redirect to Azure Static Web Apps logout endpoint', () => {
      staticWebAppAuthService.logout();

      expect(window.location.href).toBe('/.auth/logout');
    });
  });
});