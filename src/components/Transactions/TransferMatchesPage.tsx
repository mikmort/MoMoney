import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { Card, PageHeader, Button, FlexBox } from '../../styles/globalStyles';
import { Transaction } from '../../types';
import { TransferMatch } from '../../services/transferMatchingService';
import { useTransferMatching } from '../../hooks/useTransferMatching';
import { dataService } from '../../services/dataService';
import { currencyDisplayService } from '../../services/currencyDisplayService';

const TransferMatchesContainer = styled.div`
  .stats-bar {
    display: flex;
    gap: 24px;
    margin-bottom: 20px;
    
    .stat {
      background: white;
      padding: 16px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      
      .label {
        font-size: 0.85rem;
        color: #666;
        margin-bottom: 4px;
      }
      
      .value {
        font-size: 1.1rem;
        font-weight: 600;
        color: #333;
      }
    }
  }
`;

const MatchesGrid = styled.div`
  display: grid;
  gap: 16px;
  margin-bottom: 20px;
`;

const MatchCard = styled(Card)`
  .match-header {
    display: flex;
    justify-content: between;
    align-items: center;
    padding: 16px;
    background: #f8f9fa;
    border-radius: 8px 8px 0 0;
    border-bottom: 1px solid #e0e0e0;

    .match-title {
      font-weight: 600;
      color: #333;
      margin: 0;
    }

    .match-status {
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.8rem;
      font-weight: 600;
      
      &.matched {
        background: #e8f5e8;
        color: #2e7d32;
      }
      
      &.potential {
        background: #fff3cd;
        color: #856404;
      }
    }

    .confidence-badge {
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.8rem;
      font-weight: 600;
      margin-left: 8px;
      
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

  .transactions-pair {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 16px;
    align-items: center;
    margin-bottom: 16px;
  }

  .transaction-details {
    padding: 12px;
    background: #f9f9f9;
    border-radius: 6px;
    
    .description {
      font-weight: 600;
      color: #333;
      margin-bottom: 8px;
    }
    
    .meta {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 0.9rem;
      color: #666;
    }
    
    .amount {
      font-weight: 600;
    }
    
    .amount.positive {
      color: #4caf50;
    }
    
    .amount.negative {
      color: #f44336;
    }
  }

  .transfer-arrow {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    color: #9C27B0;
  }

  .match-details {
    font-size: 0.9rem;
    color: #666;
    margin-bottom: 16px;
    padding: 12px;
    background: #f0f8ff;
    border-radius: 4px;
    border-left: 4px solid #2196f3;
  }

  .match-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
`;

const ManualMatchSection = styled(Card)`
  margin-bottom: 20px;

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;

    h3 {
      margin: 0;
      color: #333;
    }

    .toggle-btn {
      padding: 8px 16px;
      background: #2196f3;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      
      &:hover {
        background: #1976d2;
      }
    }
  }

  .manual-match-form {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: 16px;
    align-items: end;

    .transaction-selector {
      .label {
        display: block;
        margin-bottom: 6px;
        font-weight: 500;
        color: #555;
        font-size: 0.9rem;
      }

      select {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;

        &:focus {
          outline: none;
          border-color: #2196f3;
          box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.1);
        }
      }
    }

    .match-validation {
      padding: 12px;
      border-radius: 4px;
      font-size: 0.9rem;
      font-weight: 500;
      margin-top: 16px;
      grid-column: 1 / -1;
      
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
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 60px 20px;
  color: #666;

  .icon {
    font-size: 4rem;
    margin-bottom: 16px;
    color: #ddd;
  }

  .title {
    font-size: 1.2rem;
    font-weight: 600;
    margin-bottom: 8px;
    color: #333;
  }

  .description {
    font-size: 0.95rem;
    line-height: 1.5;
    max-width: 500px;
    margin: 0 auto 24px;
  }
`;

export const TransferMatchesPage: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [existingMatches, setExistingMatches] = useState<TransferMatch[]>([]);
  const [potentialMatches, setPotentialMatches] = useState<TransferMatch[]>([]);
  const [showManualMatch, setShowManualMatch] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [selectedTarget, setSelectedTarget] = useState<string>('');

  const {
    isLoading,
    error,
    findTransferMatches,
    applyTransferMatches,
    unmatchTransfers,
    getMatchedTransfers,
    manuallyMatchTransfers,
    getUnmatchedTransfers
  } = useTransferMatching();

  const AmountText: React.FC<{ tx: Transaction }> = ({ tx }) => {
    const [text, setText] = useState<string>('');
    useEffect(() => {
      let mounted = true;
      (async () => {
        await currencyDisplayService.initialize();
        const info = await currencyDisplayService.formatTransactionAmount(tx);
        const s = info.displayAmount + (info.approxConvertedDisplay ? ` ${info.approxConvertedDisplay}` : '');
        if (mounted) setText(s);
      })();
      return () => { mounted = false; };
    }, [tx]);
    return <>{text}</>;
  };

  const loadData = useCallback(async () => {
    try {
      const allTransactions = await dataService.getAllTransactions();
      setTransactions(allTransactions);

      // Get existing matches
      const existing = getMatchedTransfers(allTransactions);
      setExistingMatches(existing);

      // Find potential new matches
      const result = await findTransferMatches({
        transactions: allTransactions,
        maxDaysDifference: 7,
        tolerancePercentage: 0.01
      });

      if (result) {
        setPotentialMatches(result.matches);
      }
    } catch (error) {
      console.error('Error loading transfer matches data:', error);
    }
  }, [findTransferMatches, getMatchedTransfers]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleApplyMatch = async (match: TransferMatch) => {
    try {
      const updatedTransactions = await applyTransferMatches(transactions, [match]);
      await dataService.updateTransaction(match.sourceTransactionId, {
        reimbursementId: match.targetTransactionId,
        notes: (transactions.find(t => t.id === match.sourceTransactionId)?.notes || '') + '\n[Transfer Match Applied]'
      });
      await dataService.updateTransaction(match.targetTransactionId, {
        reimbursementId: match.sourceTransactionId,
        notes: (transactions.find(t => t.id === match.targetTransactionId)?.notes || '') + '\n[Transfer Match Applied]'
      });
      setTransactions(updatedTransactions);
      await loadData(); // Refresh all data
    } catch (error) {
      console.error('Error applying match:', error);
    }
  };

  const handleUnmatch = async (match: TransferMatch) => {
    try {
      const updatedTransactions = await unmatchTransfers(transactions, match.id);
      await dataService.updateTransaction(match.sourceTransactionId, {
        reimbursementId: undefined
      });
      await dataService.updateTransaction(match.targetTransactionId, {
        reimbursementId: undefined
      });
      setTransactions(updatedTransactions);
      await loadData(); // Refresh all data
    } catch (error) {
      console.error('Error unmatching:', error);
    }
  };

  const handleManualMatch = async () => {
    if (!selectedSource || !selectedTarget) return;

    try {
      const updatedTransactions = await manuallyMatchTransfers(
        transactions,
        selectedSource,
        selectedTarget
      );
      await dataService.updateTransaction(selectedSource, {
        reimbursementId: selectedTarget,
        notes: (transactions.find(t => t.id === selectedSource)?.notes || '') + '\n[Manual Transfer Match]'
      });
      await dataService.updateTransaction(selectedTarget, {
        reimbursementId: selectedSource,
        notes: (transactions.find(t => t.id === selectedTarget)?.notes || '') + '\n[Manual Transfer Match]'
      });
      setTransactions(updatedTransactions);
      setSelectedSource('');
      setSelectedTarget('');
      await loadData(); // Refresh all data
    } catch (error) {
      console.error('Error manually matching:', error);
    }
  };

  const handleFindNewMatches = async () => {
    await loadData();
  };

  const getConfidenceClass = (confidence: number) => {
    if (confidence > 0.9) return 'high';
    if (confidence >= 0.6) return 'medium';
    return 'low';
  };

  // Deprecated local formatter removed in favor of currencyDisplayService

  const validateManualMatch = () => {
    if (!selectedSource || !selectedTarget) return null;

    const sourceTx = transactions.find(t => t.id === selectedSource);
    const targetTx = transactions.find(t => t.id === selectedTarget);

    if (!sourceTx || !targetTx) return null;

    // Check if same account
    if (sourceTx.account === targetTx.account) {
      return { isValid: false, reason: 'Cannot match transfers within the same account' };
    }

    // Check amount similarity
    const amountDiff = Math.abs(Math.abs(sourceTx.amount) - Math.abs(targetTx.amount));
    const tolerance = 0.01; // 1% tolerance
    const avgAmount = (Math.abs(sourceTx.amount) + Math.abs(targetTx.amount)) / 2;
    const isAmountValid = avgAmount > 0 && (amountDiff / avgAmount) <= tolerance;

    return {
      isValid: isAmountValid,
      reason: isAmountValid 
        ? `Amounts match within tolerance ($${amountDiff.toFixed(2)} difference)`
        : `Large amount difference ($${amountDiff.toFixed(2)}). This may not be a valid transfer match.`,
      sourceTx,
      targetTx,
      amountDiff
    };
  };

  const unmatchedTransfers = getUnmatchedTransfers(transactions);
  const availableForManualMatch = unmatchedTransfers.filter(t => t.type === 'transfer');

  const totalMatches = existingMatches.length;
  const totalUnmatched = unmatchedTransfers.length;
  const totalTransfers = transactions.filter(t => t.type === 'transfer').length;

  const validation = validateManualMatch();

  return (
    <div>
      <PageHeader>
        <h1>Transfer Matches</h1>
        <FlexBox gap="12px">
          <Button 
            variant="outline" 
            onClick={handleFindNewMatches}
            disabled={isLoading}
          >
            {isLoading ? 'Finding...' : '🔍 Find New Matches'}
          </Button>
          <Button variant="outline">Export Matches</Button>
        </FlexBox>
      </PageHeader>

      <TransferMatchesContainer>
        {/* Stats Bar */}
        <div className="stats-bar">
          <div className="stat">
            <div className="label">Total Transfers</div>
            <div className="value">{totalTransfers}</div>
          </div>
          <div className="stat">
            <div className="label">Matched</div>
            <div className="value">{totalMatches}</div>
          </div>
          <div className="stat">
            <div className="label">Unmatched</div>
            <div className="value">{totalUnmatched}</div>
          </div>
          <div className="stat">
            <div className="label">Potential Matches</div>
            <div className="value">{potentialMatches.length}</div>
          </div>
        </div>

        {error && (
          <Card style={{ marginBottom: '20px', padding: '16px', background: '#ffebee', color: '#c62828' }}>
            Error: {error}
          </Card>
        )}

        {/* Manual Match Section */}
        <ManualMatchSection>
          <div className="section-header">
            <h3>Manual Matching</h3>
            <button 
              className="toggle-btn"
              onClick={() => setShowManualMatch(!showManualMatch)}
            >
              {showManualMatch ? 'Hide' : 'Show'} Manual Match
            </button>
          </div>
          
          {showManualMatch && (
            <div className="manual-match-form">
              <div className="transaction-selector">
                <label className="label">Source Transaction</label>
                <select
                  value={selectedSource}
                  onChange={(e) => setSelectedSource(e.target.value)}
                >
                  <option value="">Select source transaction...</option>
                  {availableForManualMatch.map(tx => (
                    <option key={tx.id} value={tx.id}>
                      {tx.description} - {tx.account} - <AmountText tx={tx} /> ({tx.date.toLocaleDateString()})
                    </option>
                  ))}
                </select>
              </div>

              <div className="transaction-selector">
                <label className="label">Target Transaction</label>
                <select
                  value={selectedTarget}
                  onChange={(e) => setSelectedTarget(e.target.value)}
                  disabled={!selectedSource}
                >
                  <option value="">Select target transaction...</option>
                  {availableForManualMatch
                    .filter(tx => tx.id !== selectedSource && tx.account !== transactions.find(t => t.id === selectedSource)?.account)
                    .map(tx => (
                      <option key={tx.id} value={tx.id}>
                        {tx.description} - {tx.account} - <AmountText tx={tx} /> ({tx.date.toLocaleDateString()})
                      </option>
                    ))}
                </select>
              </div>

              <Button
                onClick={handleManualMatch}
                disabled={!selectedSource || !selectedTarget || isLoading || (validation !== null && !validation.isValid)}
              >
                Match
              </Button>

              {validation !== null && (
                <div className={`match-validation ${validation.isValid ? 'valid' : 'invalid'}`}>
                  {validation.isValid ? '✅' : '⚠️'} {validation.reason}
                </div>
              )}
            </div>
          )}
        </ManualMatchSection>

        {/* Existing Matches */}
        {existingMatches.length > 0 && (
          <>
            <h2>Current Matches ({existingMatches.length})</h2>
            <MatchesGrid>
              {existingMatches.map((match) => {
                const sourceTx = transactions.find(t => t.id === match.sourceTransactionId);
                const targetTx = transactions.find(t => t.id === match.targetTransactionId);
                
                if (!sourceTx || !targetTx) return null;
                
                return (
                  <MatchCard key={match.id}>
                    <div className="match-header">
                      <h3 className="match-title">✅ Matched Transfer</h3>
                      <div>
                        <span className="match-status matched">Matched</span>
                        <span className={`confidence-badge ${getConfidenceClass(match.confidence)}`}>
                          {Math.round(match.confidence * 100)}%
                        </span>
                      </div>
                    </div>
                    <div className="match-content">
                      <div className="transactions-pair">
                        <div className="transaction-details" >
                          <div className="description">{sourceTx.description}</div>
                          <div className="meta">
                            <div><strong>Account:</strong> {sourceTx.account}</div>
                            <div><strong>Amount:</strong> <span className={`amount ${targetTx.amount > 0 ? 'positive' : 'negative'}`}><AmountText tx={sourceTx} /></span></div>
                            <div><strong>Date:</strong> {sourceTx.date.toLocaleDateString()}</div>
                          </div>
                        </div>
                        
                        <div className="transfer-arrow">↔️</div>
                        
                        <div className="transaction-details" >
                          <div className="description">{targetTx.description}</div>
                          <div className="meta">
                            <div><strong>Account:</strong> {targetTx.account}</div>
                            <div><strong>Amount:</strong> <span className={`amount ${targetTx.amount > 0 ? 'positive' : 'negative'}`}><AmountText tx={targetTx} /></span></div>
                            <div><strong>Date:</strong> {targetTx.date.toLocaleDateString()}</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="match-details">
                        <strong>Match Details:</strong> {match.reasoning} • {match.dateDifference} days apart
                        {match.amountDifference > 0 && ` • $${match.amountDifference.toFixed(2)} amount difference`}
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
                  </MatchCard>
                );
              })}
            </MatchesGrid>
          </>
        )}

        {/* Potential Matches */}
        {potentialMatches.length > 0 && (
          <>
            <h2>Potential Matches ({potentialMatches.length})</h2>
            <MatchesGrid>
              {potentialMatches.map((match) => {
                const sourceTx = transactions.find(t => t.id === match.sourceTransactionId);
                const targetTx = transactions.find(t => t.id === match.targetTransactionId);
                
                if (!sourceTx || !targetTx) return null;
                
                return (
                  <MatchCard key={match.id}>
                    <div className="match-header">
                      <h3 className="match-title">🔄 Potential Match</h3>
                      <div>
                        <span className="match-status potential">Potential</span>
                        <span className={`confidence-badge ${getConfidenceClass(match.confidence)}`}>
                          {Math.round(match.confidence * 100)}%
                        </span>
                      </div>
                    </div>
                    <div className="match-content">
                      <div className="transactions-pair">
                        <div className="transaction-details" >
                          <div className="description">{sourceTx.description}</div>
                          <div className="meta">
                            <div><strong>Account:</strong> {sourceTx.account}</div>
                            <div><strong>Amount:</strong> <span className={`amount ${targetTx.amount > 0 ? 'positive' : 'negative'}`}><AmountText tx={sourceTx} /></span></div>
                            <div><strong>Date:</strong> {sourceTx.date.toLocaleDateString()}</div>
                          </div>
                        </div>
                        
                        <div className="transfer-arrow">↔️</div>
                        
                        <div className="transaction-details" >
                          <div className="description">{targetTx.description}</div>
                          <div className="meta">
                            <div><strong>Account:</strong> {targetTx.account}</div>
                            <div><strong>Amount:</strong> <span className={`amount ${targetTx.amount > 0 ? 'positive' : 'negative'}`}><AmountText tx={targetTx} /></span></div>
                            <div><strong>Date:</strong> {targetTx.date.toLocaleDateString()}</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="match-details">
                        <strong>Match Reasoning:</strong> {match.reasoning} • {match.dateDifference} days apart
                        {match.amountDifference > 0 && ` • $${match.amountDifference.toFixed(2)} amount difference`}
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
                  </MatchCard>
                );
              })}
            </MatchesGrid>
          </>
        )}

        {/* Empty State */}
        {existingMatches.length === 0 && potentialMatches.length === 0 && !isLoading && (
          <Card>
            <EmptyState>
              <div className="icon">🔄</div>
              <div className="title">No Transfer Matches Found</div>
              <div className="description">
                There are currently no transfer matches in your transactions. 
                Transfer matches help you identify money movements between your accounts.
                <br /><br />
                Try clicking "Find New Matches" to search for potential transfer matches,
                or use the manual matching feature above to link related transfers.
              </div>
              <Button onClick={handleFindNewMatches} disabled={isLoading}>
                {isLoading ? 'Searching...' : 'Find Transfer Matches'}
              </Button>
            </EmptyState>
          </Card>
        )}
      </TransferMatchesContainer>
    </div>
  );
};