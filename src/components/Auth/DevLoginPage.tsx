import React from 'react';
import styled from 'styled-components';
import { useDevAuth } from './DevAuthProvider';

const DevLoginContainer = styled.div`
  display: flex;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
`;

const DevLoginCard = styled.div`
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

const DevNotice = styled.div`
  background: #e3f2fd;
  border: 1px solid #2196f3;
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 24px;
  color: #1976d2;
  font-size: 0.9rem;
  
  strong {
    display: block;
    margin-bottom: 8px;
  }
`;

const LoginButton = styled.button`
  background: #2196f3;
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
    background: #1976d2;
  }

  &:active {
    background: #1565c0;
  }
`;

const DevLoginPage: React.FC = () => {
  const { login } = useDevAuth();

  const handleDevLogin = () => {
    login();
  };

  return (
    <DevLoginContainer>
      <DevLoginCard>
        <Logo>💰</Logo>
        <Title>Mo Money</Title>
        <Subtitle>Development Mode</Subtitle>
        
        <DevNotice>
          <strong>🚧 Development Mode Active</strong>
          Authentication is bypassed for testing. In production, this will use Microsoft Account sign-in.
        </DevNotice>

        <LoginButton onClick={handleDevLogin}>
          Continue as Test User
        </LoginButton>
      </DevLoginCard>
    </DevLoginContainer>
  );
};

export default DevLoginPage;
