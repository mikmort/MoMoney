import React, { useState } from 'react';
import styled from 'styled-components';
import { bankConnectivityService } from '../../services/bankConnectivityService';
import { BankConnection } from '../../types';
import { Button } from '../../styles/globalStyles';

const AddConnectionContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const InstitutionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-top: 16px;
`;

const InstitutionCard = styled.button<{ $isSelected: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  border: 2px solid ${props => props.$isSelected ? '#2196f3' : '#e0e0e0'};
  border-radius: 8px;
  background: ${props => props.$isSelected ? '#f3f9ff' : 'white'};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: #2196f3;
    background: #f3f9ff;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const InstitutionLogo = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  margin-bottom: 12px;
`;

const InstitutionName = styled.h4`
  margin: 0;
  font-size: 14px;
  color: #333;
  text-align: center;
`;

const ConnectButton = styled(Button)`
  align-self: flex-start;
  background: #4caf50;
  color: white;
  border: 1px solid #4caf50;

  &:hover:not(:disabled) {
    background: #45a049;
    border-color: #45a049;
  }

  &:disabled {
    background: #cccccc;
    border-color: #cccccc;
    cursor: not-allowed;
  }
`;

const InfoText = styled.p`
  color: #666;
  font-size: 14px;
  line-height: 1.5;
  margin: 0;
`;

const DemoNotice = styled.div`
  background: #fff3cd;
  border: 1px solid #ffeaa7;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;

  h4 {
    margin: 0 0 8px 0;
    color: #856404;
  }

  p {
    margin: 0;
    color: #856404;
    font-size: 14px;
  }
`;

interface AddBankConnectionProps {
  onConnectionAdded: (connection: BankConnection) => void;
  disabled?: boolean;
}

export const AddBankConnection: React.FC<AddBankConnectionProps> = ({
  onConnectionAdded,
  disabled = false
}) => {
  const [selectedInstitution, setSelectedInstitution] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState(false);

  const supportedInstitutions = bankConnectivityService.getSupportedInstitutions();

  const handleConnect = async () => {
    if (!selectedInstitution || isConnecting) return;

    setIsConnecting(true);
    
    try {
      // In development mode, simulate the OAuth flow
      const selectedInst = supportedInstitutions.find(inst => inst.id === selectedInstitution);
      if (!selectedInst) throw new Error('Institution not found');

      // Step 1: Create link token (simulated)
      const linkToken = await bankConnectivityService.createLinkToken();
      
      // Step 2: Simulate user completing OAuth flow and getting public token
      // In production, this would open Plaid Link and user would authenticate
      const publicToken = 'mock_public_token_' + Date.now();
      
      // Step 3: Exchange public token for access token and create connection
      const connection = await bankConnectivityService.exchangePublicToken(
        publicToken, 
        selectedInst.name
      );

      setSelectedInstitution('');
      onConnectionAdded(connection);
      alert(`✅ Successfully connected to ${selectedInst.name}!\n\nYou can now sync transactions from your connected accounts.`);

    } catch (error) {
      console.error('Failed to connect bank:', error);
      alert('❌ Failed to connect to bank. Please try again.\n\nIn a production environment, you would need valid Plaid credentials.');
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <AddConnectionContainer>
      <DemoNotice>
        <h4>🔧 Development Mode</h4>
        <p>
          This is a demonstration of bank connectivity. In production, this would use Plaid's OAuth flow 
          to securely connect to your actual bank accounts. No real banking credentials are needed for this demo.
        </p>
      </DemoNotice>

      <InfoText>
        <strong>Connect your bank accounts to automatically import transactions.</strong>
        <br />
        Select your financial institution below to get started. We use bank-grade security and never store your login credentials.
      </InfoText>

      <div>
        <h4>Select Your Bank or Credit Union:</h4>
        <InstitutionGrid>
          {supportedInstitutions.map(institution => (
            <InstitutionCard
              key={institution.id}
              type="button"
              $isSelected={selectedInstitution === institution.id}
              onClick={() => setSelectedInstitution(institution.id)}
              disabled={disabled || isConnecting}
            >
              <InstitutionLogo>
                {institution.id === 'chase' ? '🏦' : '🏛️'}
              </InstitutionLogo>
              <InstitutionName>{institution.name}</InstitutionName>
            </InstitutionCard>
          ))}
        </InstitutionGrid>
      </div>

      {selectedInstitution && (
        <div>
          <ConnectButton
            onClick={handleConnect}
            disabled={disabled || isConnecting || !selectedInstitution}
          >
            {isConnecting ? 'Connecting...' : `🔗 Connect to ${supportedInstitutions.find(i => i.id === selectedInstitution)?.name}`}
          </ConnectButton>
          <InfoText style={{ marginTop: '8px', fontSize: '12px' }}>
            You will be redirected to your bank's secure login page to authorize the connection.
          </InfoText>
        </div>
      )}
    </AddConnectionContainer>
  );
};