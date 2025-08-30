// Development mode configuration
export const isDevelopmentMode = process.env.NODE_ENV === 'development';
export const skipAuthentication = process.env.REACT_APP_SKIP_AUTH === 'true';

// Debug logging for development
if (isDevelopmentMode) {
  console.log('[Dev Config] NODE_ENV:', process.env.NODE_ENV);
  console.log('[Dev Config] REACT_APP_SKIP_AUTH:', process.env.REACT_APP_SKIP_AUTH);
  console.log('[Dev Config] skipAuthentication:', skipAuthentication);
}

// Mock user data for development
export const mockUser = {
  id: 'dev-user-123',
  displayName: 'Development User',
  email: 'dev@momoney.app',
  profilePicture: undefined,
  preferences: {
    currency: 'USD',
    dateFormat: 'MM/dd/yyyy',
    theme: 'light' as const,
    defaultAccount: 'Chase Checking',
    enableNotifications: true,
    budgetAlerts: true,
    autoCategorizationEnabled: true,
    showInvestments: false, // Hide investment transactions by default
    includeInvestmentsInReports: false // Don't include investments in spending/income reports by default
  }
};
