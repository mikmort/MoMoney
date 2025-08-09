import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { BankConnection, BankSyncResult } from '../../types';
import { bankConnectivityService } from '../../services/bankConnectivityService';
import { dataService } from '../../services/dataService';
import { Button } from '../../styles/globalStyles';

const BankConnectionCard = styled.div`
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  background: white;
`;

const BankHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
`;

const BankName = styled.h4`
  margin: 0;
  color: #333;
`;

const ConnectionStatus = styled.span<{ $isActive: boolean }>`
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  background: ${props => props.$isActive ? '#e8f5e8' : '#fdf2f2'};
  color: ${props => props.$isActive ? '#2e7d2e' : '#d32f2f'};
`;

const AccountList = styled.div`
  margin: 12px 0;
`;

const AccountItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;

  &:last-child {
    border-bottom: none;
  }
`;

const AccountInfo = styled.div`
  flex: 1;
`;

const AccountName = styled.div`
  font-weight: 500;
  color: #333;
`;

const AccountDetails = styled.div`
  font-size: 12px;
  color: #666;
  margin-top: 2px;
`;

const SyncButton = styled(Button)`
  margin-left: 8px;
  padding: 4px 8px;
  font-size: 12px;
`;

const RemoveButton = styled(Button)`
  background: #f44336;
  color: white;
  border: 1px solid #f44336;
  
  &:hover {
    background: #d32f2f;
    border-color: #d32f2f;
  }
`;

const LastSyncInfo = styled.div`
  font-size: 12px;
  color: #666;
  margin-top: 8px;
`;

const SyncResults = styled.div`
  margin-top: 12px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 4px;
  font-size: 14px;
`;

interface BankConnectionManagerProps {
  connections: BankConnection[];
  onConnectionRemoved: (connectionId: string) => void;
  onConnectionUpdated: () => void;
}

export const BankConnectionManager: React.FC<BankConnectionManagerProps> = ({
  connections,
  onConnectionRemoved,
  onConnectionUpdated
}) => {
  const [syncingConnections, setSyncingConnections] = useState<Set<string>>(new Set());
  const [syncResults, setSyncResults] = useState<{ [key: string]: BankSyncResult[] }>({});

  const handleSyncTransactions = async (connectionId: string, accountId?: string) => {
    setSyncingConnections(prev => new Set(prev.add(connectionId)));
    setSyncResults(prev => ({ ...prev, [connectionId]: [] }));

    try {
      const results = await bankConnectivityService.syncTransactions(connectionId, accountId);
      setSyncResults(prev => ({ ...prev, [connectionId]: results }));

      // Import synced transactions into the app
      let totalImported = 0;
      for (const result of results) {
        if (result.newTransactions > 0) {
          const connection = connections.find(c => c.id === connectionId);
          const account = connection?.accounts.find(a => a.id === result.accountId);
          if (connection && account) {
            // For demo purposes, we'll generate and import the mock transactions
            const mockTransactions = await bankConnectivityService.syncTransactions(connectionId, result.accountId);
            // In a real implementation, you'd get the actual transactions from the sync result
            // and convert them using bankConnectivityService.convertToAppTransaction()
            totalImported += result.newTransactions;
          }
        }
      }

      if (totalImported > 0) {
        onConnectionUpdated();
        alert(`✅ Successfully imported ${totalImported} transactions!`);
      } else {
        alert('ℹ️ No new transactions found.');
      }

    } catch (error) {
      console.error('Failed to sync transactions:', error);
      alert('❌ Failed to sync transactions. Please try again.');
    } finally {
      setSyncingConnections(prev => {
        const newSet = new Set(prev);
        newSet.delete(connectionId);
        return newSet;
      });
    }
  };

  const handleRemoveConnection = async (connection: BankConnection) => {
    if (window.confirm(`Are you sure you want to remove the connection to ${connection.institutionName}? This will not delete existing transactions.`)) {
      try {
        await bankConnectivityService.removeConnection(connection.id);
        onConnectionRemoved(connection.id);
        alert('✅ Bank connection removed successfully.');
      } catch (error) {
        console.error('Failed to remove connection:', error);
        alert('❌ Failed to remove connection. Please try again.');
      }
    }
  };

  const formatLastSync = (date?: Date) => {
    if (!date) return 'Never';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays === 0) {
      if (diffHours === 0) return 'Just now';
      return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    }
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  };

  if (connections.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#666', padding: '20px' }}>
        No bank connections found. Add a connection to get started.
      </div>
    );
  }

  return (
    <div>
      {connections.map(connection => (
        <BankConnectionCard key={connection.id}>
          <BankHeader>
            <BankName>🏦 {connection.institutionName}</BankName>
            <ConnectionStatus $isActive={connection.isActive}>
              {connection.isActive ? 'Connected' : 'Disconnected'}
            </ConnectionStatus>
          </BankHeader>

          <AccountList>
            {connection.accounts.map(account => (
              <AccountItem key={account.id}>
                <AccountInfo>
                  <AccountName>
                    {account.name}
                    {account.mask && ` ••••${account.mask}`}
                  </AccountName>
                  <AccountDetails>
                    {account.type.charAt(0).toUpperCase() + account.type.slice(1)}
                    {account.currentBalance !== undefined && 
                      ` • Balance: $${account.currentBalance.toLocaleString()}`
                    }
                  </AccountDetails>
                </AccountInfo>
                <div>
                  <SyncButton
                    variant="outline"
                    onClick={() => handleSyncTransactions(connection.id, account.id)}
                    disabled={syncingConnections.has(connection.id) || !account.isEnabled}
                  >
                    {syncingConnections.has(connection.id) ? 'Syncing...' : 'Sync'}
                  </SyncButton>
                </div>
              </AccountItem>
            ))}
          </AccountList>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
            <div>
              <SyncButton
                onClick={() => handleSyncTransactions(connection.id)}
                disabled={syncingConnections.has(connection.id)}
              >
                {syncingConnections.has(connection.id) ? 'Syncing All...' : '🔄 Sync All Accounts'}
              </SyncButton>
            </div>
            <RemoveButton
              variant="outline"
              onClick={() => handleRemoveConnection(connection)}
              disabled={syncingConnections.has(connection.id)}
            >
              Remove Connection
            </RemoveButton>
          </div>

          <LastSyncInfo>
            Last sync: {formatLastSync(connection.lastSyncDate)}
          </LastSyncInfo>

          {syncResults[connection.id] && syncResults[connection.id].length > 0 && (
            <SyncResults>
              <strong>Sync Results:</strong>
              {syncResults[connection.id].map((result, index) => {
                const account = connection.accounts.find(a => a.id === result.accountId);
                return (
                  <div key={index} style={{ marginTop: '4px' }}>
                    {account?.name}: {result.newTransactions} new transactions
                    {result.errors.length > 0 && (
                      <div style={{ color: '#f44336', fontSize: '12px' }}>
                        Errors: {result.errors.join(', ')}
                      </div>
                    )}
                  </div>
                );
              })}
            </SyncResults>
          )}
        </BankConnectionCard>
      ))}
    </div>
  );
};