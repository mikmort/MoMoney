import React, { useState } from 'react';
import styled from 'styled-components';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { currencyDisplayService } from '../../services/currencyDisplayService';
import { CollapsedTransfer, Transaction, TransferDisplayOptions } from '../../types';
import { CollapsedTransferRow } from './CollapsedTransferRow';
import { Card, Button, FlexBox } from '../../styles/globalStyles';

const TransferListContainer = styled.div`
  .transfer-options {
    background: white;
    padding: 16px;
    border-radius: 8px;
    margin-bottom: 16px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

    .options-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;

      h3 {
        margin: 0;
        font-size: 1.1rem;
        color: #495057;
      }
    }

    .options-controls {
      display: flex;
      gap: 16px;
      align-items: center;

      label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.9rem;
        color: #495057;
        cursor: pointer;

        input[type="checkbox"] {
          margin: 0;
        }
      }
    }
  }

  .transfer-stats {
    display: flex;
    gap: 16px;
    margin-bottom: 20px;

    .stat {
      background: white;
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      flex: 1;

      .label {
        font-size: 0.85rem;
        color: #6c757d;
        margin-bottom: 4px;
      }

      .value {
        font-size: 1.1rem;
        font-weight: 600;
        color: #495057;
      }
    }
  }

  .collapsed-transfers {
    background: white;
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;

      h3 {
        margin: 0;
        font-size: 1.1rem;
        color: #495057;
      }

      .collapse-all-btn {
        font-size: 0.85rem;
        padding: 4px 8px;
      }
    }

    .no-transfers {
      text-align: center;
      padding: 40px 20px;
      color: #6c757d;
      font-style: italic;
    }
  }

  .expanded-transfers {
    .ag-theme-alpine {
      height: 400px;
      
      .ag-row {
        &.transfer-row {
          background-color: #f8f9fa !important;
          opacity: 0.85;

          &:hover {
            opacity: 1;
            background-color: #e9ecef !important;
          }
        }
      }
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

export const TransferList: React.FC<TransferListProps> = ({
  collapsedTransfers,
  allTransfers,
  displayOptions,
  onDisplayOptionsChange,
  onUnmatchTransfer,
  onViewTransaction
}) => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [formattedTotalAmount, setFormattedTotalAmount] = useState<string>('$0.00');

  // Format total amount using default currency
  React.useEffect(() => {
    const formatTotal = async () => {
      try {
        const total = collapsedTransfers.reduce((sum, t) => sum + t.amount, 0);
        await currencyDisplayService.initialize();
        const formattedAmount = await currencyDisplayService.formatAmount(total);
        setFormattedTotalAmount(formattedAmount);
      } catch (error) {
        console.error('Error formatting total amount:', error);
        try {
          const defaultCurrency = await currencyDisplayService.getDefaultCurrency();
          const total = collapsedTransfers.reduce((sum, t) => sum + t.amount, 0);
          setFormattedTotalAmount(new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: defaultCurrency
          }).format(total));
        } catch {
          // Final fallback
          const total = collapsedTransfers.reduce((sum, t) => sum + t.amount, 0);
          setFormattedTotalAmount(new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
          }).format(total));
        }
      }
    };
    
    formatTotal();
  }, [collapsedTransfers]);

  const unmatchedTransfers = allTransfers.filter(tx => !tx.reimbursementId);

  // React cell renderer for amounts using currencyDisplayService
  const AmountCell: React.FC<any> = (props) => {
    const tx = props.data as Transaction;
    const [display, setDisplay] = React.useState<string>('');
    React.useEffect(() => {
      let mounted = true;
      (async () => {
        try {
          const info = await currencyDisplayService.formatTransactionAmount(tx as any);
          const text = info.displayAmount + (info.approxConvertedDisplay ? ` ${info.approxConvertedDisplay}` : '');
          if (mounted) setDisplay(text);
        } catch (e) {
          if (mounted) setDisplay('');
        }
      })();
      return () => { mounted = false; };
    }, [tx]);
    const color = tx.amount >= 0 ? '#28a745' : '#dc3545';
    return <span style={{ fontWeight: 600, color, display: 'inline-block', width: '100%', textAlign: 'right' }}>{display}</span>;
  };

  const transferColumnDefs: ColDef<Transaction>[] = [
    {
      headerName: 'Date',
      field: 'date',
      valueFormatter: (params) => {
        return new Intl.DateTimeFormat('en-US', {
          month: 'numeric',
          day: 'numeric',
          year: 'numeric'
        }).format(new Date(params.value));
      },
      width: 100
    },
    {
      headerName: 'Description',
      field: 'description',
      flex: 1
    },
    {
      headerName: 'Account',
      field: 'account',
      width: 150
    },
    {
      headerName: 'Amount',
      field: 'amount',
      width: 200,
      cellRenderer: AmountCell
    },
    {
      headerName: 'Match Status',
      field: 'reimbursementId',
      width: 120,
      cellRenderer: (params: any) => (
        <span style={{ fontWeight: 500, color: params.value ? '#28a745' : '#ffc107' }}>
          {params.value ? '✓ Matched' : '⚠ Unmatched'}
        </span>
      )
    }
  ];

  const toggleAllExpanded = () => {
    if (expandedRows.size === collapsedTransfers.length) {
      setExpandedRows(new Set());
    } else {
      setExpandedRows(new Set(collapsedTransfers.map(t => t.id)));
    }
  };

  const handleUnmatchTransfer = (transferId: string) => {
    // For collapsed transfers, we need to unmatch the underlying transaction pair
    const transfer = collapsedTransfers.find(t => t.id === transferId);
    if (transfer) {
      // Create match ID from the source and target transaction IDs
      const matchId = `transfer-match-${transfer.sourceTransaction.id}-${transfer.targetTransaction.id}`;
      onUnmatchTransfer(matchId);
    }
  };

  return (
    <TransferListContainer>
      <div className="transfer-options">
        <div className="options-header">
          <h3>Transfer Display Options</h3>
        </div>
        <div className="options-controls">
          <label>
            <input
              type="checkbox"
              checked={displayOptions.collapseMatched}
              onChange={(e) => onDisplayOptionsChange({
                ...displayOptions,
                collapseMatched: e.target.checked
              })}
            />
            Collapse matched transfers
          </label>
          <label>
            <input
              type="checkbox"
              checked={displayOptions.showFees}
              onChange={(e) => onDisplayOptionsChange({
                ...displayOptions,
                showFees: e.target.checked
              })}
            />
            Show associated fees
          </label>
        </div>
      </div>

      <div className="transfer-stats">
        <div className="stat">
          <div className="label">Total Transfers</div>
          <div className="value">{allTransfers.length}</div>
        </div>
        <div className="stat">
          <div className="label">Matched Pairs</div>
          <div className="value">{collapsedTransfers.length}</div>
        </div>
        <div className="stat">
          <div className="label">Unmatched</div>
          <div className="value">{unmatchedTransfers.length}</div>
        </div>
        <div className="stat">
          <div className="label">Total Amount</div>
          <div className="value">
            {formattedTotalAmount}
          </div>
        </div>
      </div>

      {displayOptions.collapseMatched && collapsedTransfers.length > 0 && (
        <div className="collapsed-transfers">
          <div className="section-header">
            <h3>Matched Transfers ({collapsedTransfers.length})</h3>
            <Button
              className="collapse-all-btn"
              onClick={toggleAllExpanded}
            >
              {expandedRows.size === collapsedTransfers.length ? 'Collapse All' : 'Expand All'}
            </Button>
          </div>
          
          {collapsedTransfers.map(transfer => (
            <CollapsedTransferRow
              key={transfer.id}
              transfer={transfer}
              onUnmatch={handleUnmatchTransfer}
              onViewTransaction={onViewTransaction}
            />
          ))}
        </div>
      )}

      {(!displayOptions.collapseMatched || unmatchedTransfers.length > 0) && (
        <Card className="expanded-transfers">
          <FlexBox justify="space-between" align="center" gap="16px" style={{ marginBottom: '16px' }}>
            <h3 style={{ margin: 0 }}>
              {displayOptions.collapseMatched ? 'Unmatched Transfers' : 'All Transfers'} 
              ({displayOptions.collapseMatched ? unmatchedTransfers.length : allTransfers.length})
            </h3>
          </FlexBox>
          
          {(displayOptions.collapseMatched ? unmatchedTransfers : allTransfers).length === 0 ? (
            <div className="no-transfers">
              No {displayOptions.collapseMatched ? 'unmatched ' : ''}transfers found
            </div>
          ) : (
            <div className="ag-theme-alpine">
              <AgGridReact<Transaction>
                rowData={displayOptions.collapseMatched ? unmatchedTransfers : allTransfers}
                columnDefs={transferColumnDefs}
                animateRows={true}
                rowSelection="multiple"
                rowClass="transfer-row"
                suppressRowHoverHighlight={false}
                defaultColDef={{
                  sortable: true,
                  filter: true,
                  resizable: true
                }}
              />
            </div>
          )}
        </Card>
      )}
    </TransferListContainer>
  );
};