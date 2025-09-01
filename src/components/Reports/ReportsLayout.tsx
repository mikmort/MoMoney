import React from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { PageHeader } from '../../styles/globalStyles';

const ReportsContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const SubNavigation = styled.nav`
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
  border-bottom: 1px solid #e0e0e0;
  padding-bottom: 10px;
`;

const SubNavLink = styled(NavLink)<{ $isActive?: boolean }>`
  padding: 10px 20px;
  border-radius: 6px;
  text-decoration: none;
  color: ${props => props.$isActive ? '#fff' : '#666'};
  background: ${props => props.$isActive ? '#007bff' : 'transparent'};
  font-weight: ${props => props.$isActive ? '600' : '400'};
  transition: all 0.2s ease;

  &:hover {
    background: ${props => props.$isActive ? '#0056b3' : '#f5f5f5'};
    color: ${props => props.$isActive ? '#fff' : '#333'};
  }

  &.active {
    background: #007bff;
    color: #fff;
    font-weight: 600;
  }
`;

const ReportsLayout: React.FC = () => {
  const location = useLocation();

  return (
    <ReportsContainer>
      <PageHeader>
        <h1>📈 Reports</h1>
        <p>Financial Analysis & Insights</p>
      </PageHeader>

      <SubNavigation>
        <SubNavLink 
          to="/reports/spending" 
          $isActive={location.pathname === '/reports/spending'}
        >
          💸 Spending
        </SubNavLink>
        <SubNavLink 
          to="/reports/income" 
          $isActive={location.pathname === '/reports/income'}
        >
          💰 Income
        </SubNavLink>
        <SubNavLink 
          to="/reports/subscriptions" 
          $isActive={location.pathname === '/reports/subscriptions'}
        >
          🔄 Subscriptions
        </SubNavLink>
      </SubNavigation>

      <Outlet />
    </ReportsContainer>
  );
};

export default ReportsLayout;