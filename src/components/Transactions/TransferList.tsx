import React from 'react';
import styled from 'styled-components';
import { CollapsedTransfer, Transaction, TransferDisplayOptions } from '../../types';

const TransferListContainer = styled.div`
  .transfer-options {
    background: white;
    padding: 16px;
    border-radius: 8px;
    margin-bottom: 16px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

    h3 {
      margin: 0;
      font-size: 1.1rem;
      color: #495057;
    }
  }
`;

interface TransferListProps {
  collapsedTransfers: CollapsedTransfer[];
  allTransfers: Transaction[];
  displayOptions: TransferDisplayOptions;
  onDisplayOptionsChange: (options: TransferDisplayOptions) => void;
  onUnmatchTransfer: (transferId: string) => void;
  onViewTransaction: (transactionId: string) => void;
}

export const TransferList: React.FC<TransferListProps> = () => {
  // Intentionally stripped UI per request: keep heading only, remove options, stats, matched/unmatched lists & grid
  return (
    <TransferListContainer>
      <div className="transfer-options">
        <h3>Transfer Display Options</h3>
      </div>
    </TransferListContainer>
  );
};