import React, { useState } from 'react';
import styled from 'styled-components';
import { CollapsedTransfer } from '../../types';

const CollapsedTransferRowWrapper = styled.div<{ isExpanded: boolean }>`
  background-color: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  margin: 2px 0;
  opacity: 0.85;
  transition: all 0.2s ease;

  &:hover {
    opacity: 1;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .collapsed-row {
    padding: 12px 16px;
    display: grid;
    grid-template-columns: auto 1fr auto auto auto;
    gap: 16px;
    align-items: center;
    cursor: pointer;

    .date {
      font-size: 0.9rem;
      color: #666;
      min-width: 80px;
    }

    .description {
      font-weight: 500;
      color: #495057;

      .transfer-path {
        font-size: 0.85rem;
        color: #6c757d;
        margin-top: 2px;
        display: flex;
        align-items: center;
        gap: 8px;

        .arrow {
          color: #adb5bd;
        }
      }
    }

    .amount {
      font-weight: 600;
      color: #495057;
      text-align: right;
      min-width: 100px;
    }

    .confidence {
      font-size: 0.85rem;
      color: #6c757d;
      text-align: right;
      min-width: 60px;
    }

    .expand-icon {
      font-size: 0.9rem;
      color: #adb5bd;
      transition: transform 0.2s ease;
      transform: ${props => props.isExpanded ? 'rotate(90deg)' : 'rotate(0deg)'};
    }
  }

  .expanded-details {
    border-top: 1px solid #dee2e6;
    padding: 16px;
    background-color: #fff;

    .detail-section {
      margin-bottom: 16px;

      h4 {
        font-size: 0.9rem;
        font-weight: 600;
        color: #495057;
        margin-bottom: 8px;
      }

      .transaction-detail {
        display: grid;
        grid-template-columns: 1fr auto auto auto;
        gap: 12px;
        align-items: center;
        padding: 8px 12px;
        background-color: #f8f9fa;
        border-radius: 4px;
        margin-bottom: 4px;

        .desc {
          color: #495057;
        }

        .account {
          font-size: 0.85rem;
          color: #6c757d;
        }

        .amount {
          font-weight: 600;
          text-align: right;

          &.negative {
            color: #dc3545;
          }

          &.positive {
            color: #28a745;
          }
        }

        .confidence {
          font-size: 0.85rem;
          color: #6c757d;
        }
      }
    }

    .match-info {
      display: flex;
      gap: 24px;
      font-size: 0.85rem;
      color: #6c757d;

      .info-item {
        display: flex;
        flex-direction: column;
        gap: 2px;

        .label {
          font-weight: 500;
        }

        .value {
          color: #495057;
        }
      }
    }

    .actions {
      display: flex;
      gap: 8px;
      margin-top: 16px;

      button {
        padding: 6px 12px;
        font-size: 0.85rem;
        border: 1px solid #dee2e6;
        background: white;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s ease;

        &:hover {
          background-color: #f8f9fa;
          border-color: #adb5bd;
        }

        &.danger {
          color: #dc3545;
          border-color: #dc3545;

          &:hover {
            background-color: #dc3545;
            color: white;
          }
        }
      }
    }
  }
`;

interface CollapsedTransferRowProps {
  transfer: CollapsedTransfer;
  onUnmatch: (transferId: string) => void;
  onViewTransaction: (transactionId: string) => void;
}

export const CollapsedTransferRow: React.FC<CollapsedTransferRowProps> = ({
  transfer,
  onUnmatch,
  onViewTransaction
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  };

  const getConfidenceLabel = (confidence: number) => {
    return `${Math.round(confidence * 100)}%`;
  };

  const getMatchTypeLabel = (matchType: string) => {
    switch (matchType) {
      case 'exact': return 'Exact Match';
      case 'approximate': return 'Approximate Match';
      case 'manual': return 'Manual Match';
      default: return 'Unknown';
    }
  };

  return (
    <CollapsedTransferRowWrapper isExpanded={isExpanded}>
      <div className="collapsed-row" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="date">{formatDate(transfer.date)}</div>
        <div className="description">
          <div>{transfer.description}</div>
          <div className="transfer-path">
            <span>{transfer.sourceAccount}</span>
            <span className="arrow">→</span>
            <span>{transfer.targetAccount}</span>
          </div>
        </div>
        <div className="amount">{formatAmount(transfer.amount)}</div>
        <div className="confidence">{getConfidenceLabel(transfer.confidence)}</div>
        <div className="expand-icon">▶</div>
      </div>

      {isExpanded && (
        <div className="expanded-details">
          <div className="detail-section">
            <h4>Transfer Details</h4>
            <div className="transaction-detail">
              <div className="desc">{transfer.sourceTransaction.description}</div>
              <div className="account">{transfer.sourceTransaction.account}</div>
              <div className={`amount negative`}>
                {formatAmount(transfer.sourceTransaction.amount)}
              </div>
              <div className="confidence">
                {Math.round((transfer.sourceTransaction.confidence || 0) * 100)}%
              </div>
            </div>
            <div className="transaction-detail">
              <div className="desc">{transfer.targetTransaction.description}</div>
              <div className="account">{transfer.targetTransaction.account}</div>
              <div className={`amount positive`}>
                {formatAmount(transfer.targetTransaction.amount)}
              </div>
              <div className="confidence">
                {Math.round((transfer.targetTransaction.confidence || 0) * 100)}%
              </div>
            </div>
          </div>

          <div className="match-info">
            <div className="info-item">
              <div className="label">Match Type</div>
              <div className="value">{getMatchTypeLabel(transfer.matchType)}</div>
            </div>
            <div className="info-item">
              <div className="label">Match Confidence</div>
              <div className="value">{getConfidenceLabel(transfer.confidence)}</div>
            </div>
            {transfer.amountDifference && transfer.amountDifference > 0 && (
              <div className="info-item">
                <div className="label">Amount Difference</div>
                <div className="value">{formatAmount(transfer.amountDifference)}</div>
              </div>
            )}
            {transfer.exchangeRate && (
              <div className="info-item">
                <div className="label">Exchange Rate</div>
                <div className="value">{transfer.exchangeRate.toFixed(4)}</div>
              </div>
            )}
          </div>

          <div className="actions">
            <button onClick={() => onViewTransaction(transfer.sourceTransaction.id)}>
              View Source
            </button>
            <button onClick={() => onViewTransaction(transfer.targetTransaction.id)}>
              View Target
            </button>
            <button 
              className="danger" 
              onClick={() => onUnmatch(transfer.id)}
            >
              Unmatch Transfer
            </button>
          </div>
        </div>
      )}
    </CollapsedTransferRowWrapper>
  );
};