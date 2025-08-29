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
      
      const data = await response.json();
      
      // Azure Static Web Apps returns user info in clientPrincipal
      if (data.clientPrincipal) {
        this.userCache = data.clientPrincipal;
        return this.userCache;
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching user info:', error);
      return null;
    }
  }
  
  login(redirectUrl = '/welcome'): void {
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