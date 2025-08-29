/**
 * Authentication service for Azure Static Web Apps
 * Uses built-in authentication endpoints instead of MSAL
 */

export interface StaticWebAppUser {
  userDetails: string;
  userRoles: string[];
  identityProvider: string;
  userId: string;
  claims: Array<{
    typ: string;
    val: string;
  }>;
}

export interface StaticWebAppAuthService {
  /**
   * Check if user is authenticated by calling /.auth/me
   */
  isAuthenticated(): Promise<boolean>;
  
  /**
   * Get current user information
   */
  getUser(): Promise<StaticWebAppUser | null>;
  
  /**
   * Redirect to login page
   */
  login(redirectUrl?: string): void;
  
  /**
   * Logout user
   */
  logout(): void;
}

class StaticWebAppAuthServiceImpl implements StaticWebAppAuthService {
  private userCache: StaticWebAppUser | null = null;
  
  async isAuthenticated(): Promise<boolean> {
    try {
      const user = await this.getUser();
      return user !== null;
    } catch {
      return false;
    }
  }
  
  async getUser(): Promise<StaticWebAppUser | null> {
    try {
      const response = await fetch('/.auth/me');
      
      if (!response.ok) {
        return null;
      }
      
      // Check if response is actually JSON (only if headers are available)
      const contentType = response.headers?.get('content-type');
      if (contentType && !contentType.includes('application/json')) {
        // Check if we're in a development environment
        if (process.env.NODE_ENV === 'development') {
          console.warn('/.auth/me endpoint returned non-JSON response - running in local development mode. Azure Static Web Apps authentication is not available locally. Consider setting REACT_APP_SKIP_AUTH=true for development.');
        } else {
          console.warn('/.auth/me endpoint returned non-JSON response - likely not deployed as Azure Static Web App');
        }
        return null;
      }
      
      const data = await response.json();
      
      // Azure Static Web Apps returns user info in clientPrincipal
      if (data.clientPrincipal) {
        this.userCache = data.clientPrincipal;
        return this.userCache;
      }
      
      return null;
    } catch (error) {
      // More specific error handling for common development scenarios
      if (error instanceof SyntaxError && error.message.includes('Unexpected token')) {
        // Check if we're in a development environment
        if (process.env.NODE_ENV === 'development') {
          console.warn('/.auth/me endpoint returned HTML instead of JSON - running in local development mode. Azure Static Web Apps authentication is not available locally. Consider setting REACT_APP_SKIP_AUTH=true for development.');
        } else {
          console.warn('/.auth/me endpoint returned HTML instead of JSON - application not running in Azure Static Web Apps context');
        }
      } else {
        console.error('Error fetching user info:', error);
      }
      return null;
    }
  }
  
  login(redirectUrl = '/welcome'): void {
    // Check if we're in development mode and provide helpful guidance
    if (process.env.NODE_ENV === 'development') {
      console.error('Azure Static Web Apps authentication is not available in local development mode. To test authentication locally, set REACT_APP_SKIP_AUTH=true in your .env file to use development mode authentication.');
    }
    
    // Use Azure Static Web Apps built-in auth endpoint
    const loginUrl = redirectUrl 
      ? `/.auth/login/aad?post_login_redirect_uri=${encodeURIComponent(redirectUrl)}`
      : '/.auth/login/aad';
    
    window.location.href = loginUrl;
  }
  
  logout(): void {
    // Use Azure Static Web Apps built-in logout endpoint
    window.location.href = '/.auth/logout';
  }
}

// Export singleton instance
export const staticWebAppAuthService = new StaticWebAppAuthServiceImpl();