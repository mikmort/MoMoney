import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { useAppAuth } from '../../hooks/useAppAuth';

const Nav = styled.nav`
  width: 250px;
  background: #2c3e50;
  color: white;
  padding: 20px 0;
  display: flex;
  flex-direction: column;
`;

const Logo = styled.div`
  padding: 0 20px 20px;
  border-bottom: 1px solid #34495e;
  margin-bottom: 20px;
  
  h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
  }
  
  span {
    font-size: 2rem;
    margin-right: 8px;
  }
`;

const NavLinks = styled.div`
  flex: 1;
`;

const NavLink = styled(Link)<{ $isActive: boolean }>`
  display: flex;
  align-items: center;
  padding: 12px 20px;
  color: ${props => props.$isActive ? '#3498db' : '#ecf0f1'};
  text-decoration: none;
  background: ${props => props.$isActive ? '#34495e' : 'transparent'};
  border-left: ${props => props.$isActive ? '4px solid #3498db' : '4px solid transparent'};
  transition: all 0.2s ease;

  &:hover {
    background: #34495e;
    color: #3498db;
  }

  span {
    margin-right: 12px;
    font-size: 1.2rem;
  }
`;

const UserSection = styled.div`
  padding: 20px;
  border-top: 1px solid #34495e;
  
  .user-info {
    margin-bottom: 16px;
    
    .name {
      font-weight: 500;
      margin-bottom: 4px;
    }
    
    .email {
      font-size: 0.9rem;
      color: #bdc3c7;
    }
  }
`;

const LogoutButton = styled.button`
  background: #e74c3c;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  width: 100%;
  font-size: 0.9rem;
  
  &:hover {
    background: #c0392b;
  }
`;

const Navigation: React.FC = () => {
  const location = useLocation();
  const { account, user, logout } = useAppAuth();

  const navItems = [
    { path: '/', label: 'Dashboard', icon: '📊' },
    { path: '/transactions', label: 'Transactions', icon: '💳' },
    { path: '/categories', label: 'Categories', icon: '📁' },
    { path: '/budgets', label: 'Budgets', icon: '🎯' },
    { path: '/reports', label: 'Reports', icon: '📈' },
    { path: '/settings', label: 'Settings', icon: '⚙️' }
  ];

  return (
    <Nav>
      <Logo>
        <span>💰</span>
        <h2>Mo Money</h2>
      </Logo>
      
      <NavLinks>
        {navItems.map((item) => (
          <NavLink 
            key={item.path}
            to={item.path} 
            $isActive={location.pathname === item.path}
          >
            <span>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </NavLinks>

      <UserSection>
        {(account || user) && (
          <div className="user-info">
            <div className="name">{account?.name || user?.displayName}</div>
            <div className="email">{account?.username || user?.email}</div>
          </div>
        )}
        <LogoutButton onClick={logout}>
          Sign Out
        </LogoutButton>
      </UserSection>
    </Nav>
  );
};

export default Navigation;
