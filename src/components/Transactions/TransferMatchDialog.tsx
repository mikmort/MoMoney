import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { Button } from '../../styles/globalStyles';
import { Transaction } from '../../types';
import { TransferMatch } from '../../services/transferMatchingService';
import { useTransferMatching } from '../../hooks/useTransferMatching';
import { currencyDisplayService } from '../../services/currencyDisplayService';

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  background: white;
  border-radius: 8px;
  padding: 24px;
  width: 90%;
  max-width: 800px;
  max-height: 80vh;
  overflow-y: auto;

  h2 {
    margin: 0 0 20px 0;
    color: #333;
    font-size: 1.5rem;
  }
`;

const TransactionInfo = styled.div<{ $amount: number }>`
  background: #f8f9fa;
  padding: 16px;
  border-radius: 6px;
  border-left: 4px solid #9C27B0;
  margin-bottom: 20px;

  .transaction-description {
    font-weight: 600;
    font-size: 1.1rem;
    color: #333;
    margin-bottom: 8px;
  }

  .transaction-details {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    font-size: 0.9rem;
    color: #666;
  }

  .amount {
    font-weight: 600;
    color: ${props => props.$amount > 0 ? '#4caf50' : '#f44336'};
  }
`;

const MatchesList = styled.div`
  .matches-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;

    h3 {
      margin: 0;
      color: #333;
    }
  }

  .no-matches {
    text-align: center;
    color: #666;
    padding: 40px 20px;
    font-style: italic;
    background: #f9f9f9;
    border-radius: 6px;
  }
`;

const MatchItem = styled.div`
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  margin-bottom: 12px;
  background: white;

  .match-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    background: #f8f9fa;
    border-radius: 6px 6px 0 0;
    border-bottom: 1px solid #e0e0e0;

    .match-title {
      font-weight: 600;
      color: #333;
    }

    .confidence-badge {
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.8rem;
      font-weight: 600;
      
      &.high {
        background: #e8f5e8;
        color: #2e7d32;
      }
      
      &.medium {
        background: #fff3cd;
        color: #856404;
      }
      
      &.low {
        background: #f8d7da;
        color: #721c24;
      }
    }
  }

  .match-content {
    padding: 16px;
  }

  .matched-transaction {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr;
    gap: 16px;
    align-items: center;
    padding: 12px;
    background: #f9f9f9;
    border-radius: 4px;
    margin-bottom: 12px;

    .description {
      font-weight: 500;
      color: #333;
    }

    .account {
      color: #666;
      font-size: 0.9rem;
    }

    .amount {
      font-weight: 600;
      text-align: right;
    }

    .amount.positive {
      color: #4caf50;
    }

    .amount.negative {
      color: #f44336;
    }

    .date {
      color: #666;
      font-size: 0.9rem;
    }
  }

  .match-details {
    font-size: 0.9rem;
    color: #666;
    margin-bottom: 12px;
  }

  .match-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
`;

const ManualMatchSection = styled.div`
  margin-top: 24px;
  padding: 20px;
  border: 2px dashed #ddd;
  border-radius: 8px;
  background: #f9f9f9;

  h3 {
    margin: 0 0 16px 0;
    color: #333;
  }

  .manual-match-controls {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 16px;
  }

  .transaction-selector {
    flex: 1;

    select {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
  }

  .amount-validation {
    padding: 12px;
    border-radius: 4px;
    font-weight: 500;
    
    &.valid {
      background: #e8f5e8;
      color: #2e7d32;
      border: 1px solid #c8e6c9;
    }
    
    &.invalid {
      background: #ffebee;
      color: #c62828;
      border: 1px solid #ffcdd2;
    }
  }
`;

interface TransferMatchDialogProps {
  isOpen: boolean;
  transaction: Transaction | null;
  allTransactions: Transaction[];
  onClose: () => void;
  onTransactionsUpdate: (transactions: Transaction[]) => void;
}

export const TransferMatchDialog: React.FC<TransferMatchDialogProps> = ({
  isOpen,
  transaction,
  allTransactions,
  onClose,
  onTransactionsUpdate
}) => {
  const [potentialMatches, setPotentialMatches] = useState<TransferMatch[]>([]);
  const [existingMatches, setExistingMatches] = useState<TransferMatch[]>([]);
  const [selectedTransactionForManualMatch, setSelectedTransactionForManualMatch] = useState<string>('');
  
  const {
    isLoading,
    error,
    findManualTransferMatches,
    applyTransferMatches,
    unmatchTransfers,
    getMatchedTransfers,
    manuallyMatchTransfers
  } = useTransferMatching();

  const [defaultCurrency, setDefaultCurrency] = useState<string>('USD');

  useEffect(() => {
    (async () => {
      await currencyDisplayService.initialize();
      const dc = await currencyDisplayService.getDefaultCurrency();
      setDefaultCurrency(dc);
    })();
  }, []);

  const AmountText: React.FC<{ tx: Transaction }> = ({ tx }) => {
    const [text, setText] = useState<string>('');
    useEffect(() => {
      let mounted = true;
      (async () => {
        try {
          const info = await currencyDisplayService.formatTransactionAmount(tx);
          if (info && info.displayAmount) {
            const s = info.displayAmount + (info.approxConvertedDisplay ? ` ${info.approxConvertedDisplay}` : '');
            if (mounted) setText(s);
          } else {
            // Fallback formatting
            const fallback = new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD'
            }).format(tx.amount);
            if (mounted) setText(fallback);
          }
        } catch (error) {
          // Fallback formatting on error
          const fallback = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
          }).format(tx.amount);
          if (mounted) setText(fallback);
        }
      })();
      return () => { mounted = false; };
    }, [tx]);
    return <>{text}</>;
  };

  const AmountDifference: React.FC<{ a: Transaction; b: Transaction; defaultCurrency: string }> = ({ a, b, defaultCurrency }) => {
    const [text, setText] = useState<string>('');
    useEffect(() => {
      let mounted = true;
      (async () => {
        try {
          const [ac, bc] = await Promise.all([
            currencyDisplayService.convertTransactionAmount(a),
            currencyDisplayService.convertTransactionAmount(b)
          ]);
          const diff = Math.abs(Math.abs(ac.amount) - Math.abs(bc.amount));
          const formatted = await currencyDisplayService.formatAmount(diff, defaultCurrency);
          if (mounted) setText(formatted);
        } catch (error) {
          // Fallback calculation
          const diff = Math.abs(Math.abs(a.amount) - Math.abs(b.amount));
          const fallback = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: defaultCurrency || 'USD'
          }).format(diff);
          if (mounted) setText(fallback);
        }
      })();
      return () => { mounted = false; };
    }, [a, b, defaultCurrency]);
    return <>{text ? ` • ≈ ${text} difference` : ''}</>;
  };

  const loadMatches = useCallback(async () => {
    if (!transaction) return;

    try {
      // Find potential new matches using manual (relaxed criteria) matching
      const result = await findManualTransferMatches({
        transactions: allTransactions,
        maxDaysDifference: 8, // Expanded date range
        tolerancePercentage: 0.12 // 12% tolerance for exchange rates
      });

      if (result) {
        // Filter matches related to this transaction
        const relatedMatches = result.matches.filter(m => 
          m.sourceTransactionId === transaction.id || m.targetTransactionId === transaction.id
        );
        setPotentialMatches(relatedMatches);
      }

      // Get existing matches for this transaction
      const allExisting = getMatchedTransfers(allTransactions);
      const existingForTransaction = allExisting.filter(m =>
        m.sourceTransactionId === transaction.id || m.targetTransactionId === transaction.id
      );
      setExistingMatches(existingForTransaction);

    } catch (error) {
      console.error('Error loading matches:', error);
    }
  }, [transaction, allTransactions, findManualTransferMatches, getMatchedTransfers]);

  useEffect(() => {
    if (isOpen && transaction) {
      loadMatches();
    }
  }, [isOpen, transaction, loadMatches]);

  const handleApplyMatch = async (match: TransferMatch) => {
    try {
      const updatedTransactions = await applyTransferMatches(allTransactions, [match]);
      onTransactionsUpdate(updatedTransactions);
      await loadMatches(); // Refresh matches
    } catch (error) {
      console.error('Error applying match:', error);
    }
  };

  const handleUnmatch = async (match: TransferMatch) => {
    try {
      const updatedTransactions = await unmatchTransfers(allTransactions, match.id);
      onTransactionsUpdate(updatedTransactions);
      await loadMatches(); // Refresh matches
    } catch (error) {
      console.error('Error unmatching:', error);
    }
  };

  const handleManualMatch = async () => {
    if (!transaction || !selectedTransactionForManualMatch) return;

    try {
      const updatedTransactions = await manuallyMatchTransfers(
        allTransactions,
        transaction.id,
        selectedTransactionForManualMatch
      );
      onTransactionsUpdate(updatedTransactions);
      setSelectedTransactionForManualMatch('');
      await loadMatches(); // Refresh matches
    } catch (error) {
      console.error('Error manually matching:', error);
    }
  };

  const getConfidenceClass = (confidence: number) => {
    if (confidence > 0.9) return 'high';
    if (confidence >= 0.6) return 'medium';
    return 'low';
  };

  // Deprecated local formatter removed in favor of currencyDisplayService

  const validateManualMatch = () => {
    if (!transaction || !selectedTransactionForManualMatch) return null;

    const selectedTx = allTransactions.find(t => t.id === selectedTransactionForManualMatch);
    if (!selectedTx) return null;

    const amountDiff = Math.abs(Math.abs(transaction.amount) - Math.abs(selectedTx.amount));
    const tolerance = 0.12; // 12% tolerance for manual matching with exchange rates
    const avgAmount = (Math.abs(transaction.amount) + Math.abs(selectedTx.amount)) / 2;
    const isValid = avgAmount > 0 && (amountDiff / avgAmount) <= tolerance;
    const percentageDiff = avgAmount > 0 ? (amountDiff / avgAmount) * 100 : 0;

    return {
      isValid,
      amountDiff,
      percentageDiff,
      selectedTransaction: selectedTx
    };
  };

  const availableTransactionsForManualMatch = allTransactions.filter(t =>
    t.type === 'transfer' &&
    t.id !== transaction?.id &&
    t.account !== transaction?.account &&
    !t.reimbursementId // Not already matched
  );

  if (!isOpen || !transaction) return null;

  const validation = validateManualMatch();

  return (
    <ModalOverlay onClick={onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <h2>Transfer Matches for Transaction</h2>
        
        <TransactionInfo $amount={transaction.amount}>
          <div className="transaction-description">{transaction.description}</div>
          <div className="transaction-details">
            <div><strong>Amount:</strong> <span className="amount"><AmountText tx={transaction} /></span></div>
            <div><strong>Account:</strong> {transaction.account}</div>
            <div><strong>Date:</strong> {transaction.date.toLocaleDateString()}</div>
            <div><strong>Type:</strong> Transfer</div>
          </div>
        </TransactionInfo>

        {error && (
          <div style={{ color: '#f44336', marginBottom: '16px', padding: '12px', background: '#ffebee', borderRadius: '4px' }}>
            Error: {error}
          </div>
        )}

        {/* Existing Matches */}
        {existingMatches.length > 0 && (
          <MatchesList>
            <div className="matches-header">
              <h3>Current Matches ({existingMatches.length})</h3>
            </div>
            
            {existingMatches.map((match) => {
              const matchedTx = allTransactions.find(t => 
                t.id === (match.sourceTransactionId === transaction.id ? match.targetTransactionId : match.sourceTransactionId)
              );
              
              if (!matchedTx) return null;
              
              return (
                <MatchItem key={match.id}>
                  <div className="match-header">
                    <div className="match-title">✅ Matched Transfer</div>
                    <span className={`confidence-badge ${getConfidenceClass(match.confidence)}`}>
                      {Math.round(match.confidence * 100)}%
                    </span>
                  </div>
                  <div className="match-content">
                    <div className="matched-transaction" >
                      <div className="description">{matchedTx.description}</div>
                      <div className="account">{matchedTx.account}</div>
                      <div className={`amount ${matchedTx.amount > 0 ? 'positive' : 'negative'}`}><AmountText tx={matchedTx} /></div>
                      <div className="date">{matchedTx.date.toLocaleDateString()}</div>
                    </div>
                    <div className="match-details">
                      {match.reasoning} • {match.dateDifference} days apart
                      <AmountDifference a={transaction} b={matchedTx} defaultCurrency={defaultCurrency} />
                    </div>
                    <div className="match-actions">
                      <Button
                        variant="outline"
                        onClick={() => handleUnmatch(match)}
                        disabled={isLoading}
                      >
                        Unmatch
                      </Button>
                    </div>
                  </div>
                </MatchItem>
              );
            })}
          </MatchesList>
        )}

        {/* Potential New Matches */}
        <MatchesList>
          <div className="matches-header">
            <h3>Potential Matches ({potentialMatches.length})</h3>
          </div>
          
          {potentialMatches.length === 0 ? (
            <div className="no-matches">
              No potential transfer matches found for this transaction.
            </div>
          ) : (
            potentialMatches.map((match) => {
              const matchedTx = allTransactions.find(t => 
                t.id === (match.sourceTransactionId === transaction.id ? match.targetTransactionId : match.sourceTransactionId)
              );
              
              if (!matchedTx) return null;
              
              return (
                <MatchItem key={match.id}>
                  <div className="match-header">
                    <div className="match-title">🔄 Potential Match</div>
                    <span className={`confidence-badge ${getConfidenceClass(match.confidence)}`}>
                      {Math.round(match.confidence * 100)}%
                    </span>
                  </div>
                  <div className="match-content">
                    <div className="matched-transaction" >
                      <div className="description">{matchedTx.description}</div>
                      <div className="account">{matchedTx.account}</div>
                      <div className={`amount ${matchedTx.amount > 0 ? 'positive' : 'negative'}`}><AmountText tx={matchedTx} /></div>
                      <div className="date">{matchedTx.date.toLocaleDateString()}</div>
                    </div>
                    <div className="match-details">
                      {match.reasoning} • {match.dateDifference} days apart
                      <AmountDifference a={transaction} b={matchedTx} defaultCurrency={defaultCurrency} />
                    </div>
                    <div className="match-actions">
                      <Button
                        onClick={() => handleApplyMatch(match)}
                        disabled={isLoading}
                      >
                        Apply Match
                      </Button>
                    </div>
                  </div>
                </MatchItem>
              );
            })
          )}
        </MatchesList>

        {/* Manual Match Section */}
        {availableTransactionsForManualMatch.length > 0 && (
          <ManualMatchSection>
            <h3>Manual Match</h3>
            <div className="manual-match-controls">
              <div className="transaction-selector">
                <select
                  value={selectedTransactionForManualMatch}
                  onChange={(e) => setSelectedTransactionForManualMatch(e.target.value)}
                >
                  <option value="">Select a transaction to match with...</option>
                  {availableTransactionsForManualMatch.map(tx => (
                    <option key={tx.id} value={tx.id}>
                      {tx.description} - {tx.account} - <AmountText tx={tx} /> - {tx.date.toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                onClick={handleManualMatch}
                disabled={!selectedTransactionForManualMatch || isLoading}
              >
                Match
              </Button>
            </div>

            {validation && (
              <div className={`amount-validation ${validation.isValid ? 'valid' : 'invalid'}`}>
                {validation.isValid ? (
                  <span>✅ Amounts match within tolerance (${validation.amountDiff.toFixed(2)} difference, {validation.percentageDiff.toFixed(1)}%)</span>
                ) : (
                  <span>⚠️ Amount difference is significant: ${validation.amountDiff.toFixed(2)} ({validation.percentageDiff.toFixed(1)}%). This may not be a transfer match.</span>
                )}
              </div>
            )}
          </ManualMatchSection>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px', gap: '12px' }}>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </ModalContent>
    </ModalOverlay>
  );
};