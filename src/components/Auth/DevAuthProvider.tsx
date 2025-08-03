import React from 'react';
import { skipAuthentication, mockUser } from '../../config/devConfig';

interface DevAuthProviderProps {
  children: React.ReactNode;
}

interface DevAuthContextType {
  isAuthenticated: boolean;
  user: typeof mockUser | null;
  login: () => void;
  logout: () => void;
}

const DevAuthContext = React.createContext<DevAuthContextType | undefined>(undefined);

export const DevAuthProvider: React.FC<DevAuthProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = React.useState(skipAuthentication);

  const login = () => setIsAuthenticated(true);
  const logout = () => setIsAuthenticated(false);

  const value = {
    isAuthenticated,
    user: isAuthenticated ? mockUser : null,
    login,
    logout
  };

  return (
    <DevAuthContext.Provider value={value}>
      {children}
    </DevAuthContext.Provider>
  );
};

export const useDevAuth = () => {
  const context = React.useContext(DevAuthContext);
  if (context === undefined) {
    throw new Error('useDevAuth must be used within a DevAuthProvider');
  }
  return context;
};
