import React from 'react';
import { useMsal } from '@azure/msal-react';
import { loginRequest } from '../../config/authConfig';
import styled from 'styled-components';

const LoginContainer = styled.div`
  display: flex;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
`;

const LoginCard = styled.div`
  background: white;
  border-radius: 12px;
  padding: 48px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1);
  margin: auto;
  max-width: 400px;
  width: 100%;
  text-align: center;
`;

const Logo = styled.div`
  font-size: 3rem;
  margin-bottom: 16px;
`;

const Title = styled.h1`
  color: #333;
  margin-bottom: 8px;
  font-size: 2rem;
  font-weight: 600;
`;

const Subtitle = styled.p`
  color: #666;
  margin-bottom: 32px;
  font-size: 1.1rem;
`;

const LoginButton = styled.button`
  background: #0078d4;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease;
  width: 100%;

  &:hover {
    background: #106ebe;
  }

  &:active {
    background: #005a9e;
  }
`;

const FeatureList = styled.ul`
  text-align: left;
  margin: 32px 0;
  padding: 0;
  list-style: none;

  li {
    padding: 8px 0;
    color: #666;
    
    &:before {
      content: '✓';
      color: #4caf50;
      font-weight: bold;
      margin-right: 12px;
    }
  }
`;

const LoginPage: React.FC = () => {
  const { instance } = useMsal();

  const handleLogin = async () => {
    try {
      await instance.loginPopup(loginRequest);
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  return (
    <LoginContainer>
      <LoginCard>
        <Logo>💰</Logo>
        <Title>Mo Money</Title>
        <Subtitle>Smart Money Tracking & Budgeting</Subtitle>
        
        <FeatureList>
          <li>Upload and analyze bank statements</li>
          <li>AI-powered transaction categorization</li>
          <li>Visual spending insights</li>
          <li>Budget tracking and alerts</li>
          <li>Secure Microsoft Account sign-in</li>
        </FeatureList>

        <LoginButton onClick={handleLogin}>
          Sign in with Microsoft
        </LoginButton>
      </LoginCard>
    </LoginContainer>
  );
};

export default LoginPage;
