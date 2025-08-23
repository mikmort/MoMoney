import React, { useState, useEffect, useMemo } from 'react';
import styled from 'styled-components';
import { Line, Bar } from 'react-chartjs-2';
import { Card } from '../../styles/globalStyles';
import { reportsService, CategoryDeepDive, DateRange } from '../../services/reportsService';
import { currencyDisplayService } from '../../services/currencyDisplayService';
import { Transaction } from '../../types';
import { Modal } from '../shared/Modal';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, PointElement, LineElement } from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement
);

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
`;

const StatCard = styled(Card)`
  text-align: center;
  
  .stat-value {
    font-size: 1.5rem;
    font-weight: 600;
    margin: 8px 0;
    color: #f44336;
  }
  
  .stat-label {
    color: #666;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
`;

const ChartContainer = styled.div`
  height: 300px;
  margin-bottom: 30px;
  position: relative;
`;

const ChartsGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 30px;
  margin-bottom: 30px;
  
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const ChartSection = styled.div`
  h3 {
    margin-bottom: 15px;
    color: #333;
    font-size: 1.1rem;
  }
`;

const TransactionsList = styled.div`
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid #eee;
  border-radius: 4px;
  
  .transaction-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    border-bottom: 1px solid #eee;
    
    &:last-child {
      border-bottom: none;
    }
    
    &:hover {
      background-color: #f9f9f9;
    }
  }
  
  .transaction-info {
    flex: 1;
    
    .description {
      font-weight: 500;
      margin-bottom: 4px;
    }
    
    .date {
      font-size: 0.85rem;
      color: #666;
    }
  }
  
  .transaction-amount {
    text-align: right;
    font-weight: 600;
    color: #f44336;
    
    .currency-info {
      font-size: 0.75rem;
      color: #888;
      margin-top: 2px;
    }
  }
`;

// Reusable component for displaying transaction amounts with currency conversion
const TransactionAmount: React.FC<{ transaction: Transaction }> = ({ transaction }) => {
  const [displayData, setDisplayData] = useState<{
    displayAmount: string;
    tooltip?: string;
    isConverted: boolean;
    approxConvertedDisplay?: string;
  }>({
    displayAmount: '$0.00',
    isConverted: false
  });

  useEffect(() => {
    const formatAmount = async () => {
      const data = await currencyDisplayService.formatTransactionAmount(transaction);
      setDisplayData(data);
    };
    formatAmount();
  }, [transaction]);

  return (
    <div className="transaction-amount" title={displayData.tooltip}>
      {displayData.displayAmount}
      {displayData.isConverted && displayData.approxConvertedDisplay && (
        <div className="currency-info">
          {displayData.approxConvertedDisplay}
        </div>
      )}
    </div>
  );
};

interface CategoryDrilldownModalProps {
  categoryName: string;
  dateRange?: DateRange;
  includeTransfers?: boolean;
  onClose: () => void;
}

const CategoryDrilldownModal: React.FC<CategoryDrilldownModalProps> = ({
  categoryName,
  dateRange,
  includeTransfers = false,
  onClose
}) => {
  const [loading, setLoading] = useState(true);
  const [categoryData, setCategoryData] = useState<CategoryDeepDive | null>(null);
  
  // Filtering state for interactive charts
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);

  useEffect(() => {
    const loadCategoryData = async () => {
      setLoading(true);
      try {
        const data = await reportsService.getCategoryDeepDive(categoryName, dateRange, includeTransfers);
        setCategoryData(data);
      } catch (error) {
        console.error('Failed to load category data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadCategoryData();
  }, [categoryName, dateRange, includeTransfers]);

  const [defaultCurrency, setDefaultCurrency] = useState<string>('USD');
  useEffect(() => {
    (async () => setDefaultCurrency(await currencyDisplayService.getDefaultCurrency()))();
  }, []);
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: defaultCurrency
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(date);
  };

  // Process subcategory data and filtered transactions
  const { subcategoryData, filteredTransactions, filteredTrendData } = useMemo(() => {
    if (!categoryData) {
      return { 
        subcategoryData: [], 
        filteredTransactions: [],
        filteredTrendData: []
      };
    }

    // Group transactions by subcategory
    const subcategoryTotals: { [subcategory: string]: { amount: number; transactions: Transaction[] } } = {};
    
    categoryData.recentTransactions.forEach(transaction => {
      const subcategory = transaction.subcategory || 'Uncategorized';
      if (!subcategoryTotals[subcategory]) {
        subcategoryTotals[subcategory] = { amount: 0, transactions: [] };
      }
      subcategoryTotals[subcategory].amount += Math.abs(transaction.amount);
      subcategoryTotals[subcategory].transactions.push(transaction);
    });

    // Convert to array and sort by amount
    const subcategoryDataArray = Object.entries(subcategoryTotals)
      .map(([name, data]) => ({
        name,
        amount: data.amount,
        transactions: data.transactions
      }))
      .sort((a, b) => b.amount - a.amount);

    // Filter transactions based on selected month and subcategory
    let filtered = categoryData.recentTransactions;

    if (selectedMonth) {
      filtered = filtered.filter(transaction => {
        const monthLabel = transaction.date.toLocaleDateString('en-US', { 
          month: 'short', 
          year: 'numeric' 
        });
        return monthLabel === selectedMonth;
      });
    }

    if (selectedSubcategory && selectedSubcategory !== 'Uncategorized') {
      filtered = filtered.filter(transaction => transaction.subcategory === selectedSubcategory);
    } else if (selectedSubcategory === 'Uncategorized') {
      filtered = filtered.filter(transaction => !transaction.subcategory);
    }

    // Filter trend data based on selected subcategory
    let trendDataFiltered = categoryData.trend;
    if (selectedSubcategory) {
      // Group trend by periods and filter by subcategory
      const periodTotals: { [label: string]: number } = {};
      
      filtered.forEach(transaction => {
        let label: string;
        if (categoryData.trendGranularity === 'daily') {
          label = transaction.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } else if (categoryData.trendGranularity === 'weekly') {
          // For weekly, we'll use a simplified approach
          label = transaction.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } else {
          // monthly
          label = transaction.date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        }
        
        periodTotals[label] = (periodTotals[label] || 0) + Math.abs(transaction.amount);
      });

      trendDataFiltered = Object.entries(periodTotals)
        .map(([label, amount]) => ({ label, amount }))
        .sort((a, b) => a.label.localeCompare(b.label));
    }

    return {
      subcategoryData: subcategoryDataArray,
      filteredTransactions: filtered,
      filteredTrendData: trendDataFiltered
    };
  }, [categoryData, selectedMonth, selectedSubcategory]);

  if (loading) {
    return (
      <Modal 
        isOpen={true} 
        onClose={onClose} 
        title="Loading Category Details..."
        maxWidth="1000px"
      >
        <div style={{ textAlign: 'center', padding: '40px' }}>
          Loading category analysis...
        </div>
      </Modal>
    );
  }

  if (!categoryData) {
    return (
      <Modal 
        isOpen={true} 
        onClose={onClose} 
        title="No Data Available"
        maxWidth="1000px"
      >
        <div style={{ textAlign: 'center', padding: '40px' }}>
          No data found for category "{categoryName}" in the selected date range.
        </div>
      </Modal>
    );
  }

  // Prepare chart data (trend already computed for full provided date range in reportsService)
  const trendData = {
    labels: filteredTrendData.map(item => item.label),
    datasets: [
      {
        label: `${categoryName} Spending`,
        data: filteredTrendData.map(item => item.amount),
        backgroundColor: 'rgba(244, 67, 54, 0.6)',
        borderColor: 'rgba(244, 67, 54, 1)',
        borderWidth: 2,
        fill: false
      }
    ]
  };

  // Prepare subcategory chart data (use all transactions in date range; optionally filtered by month selection)
  const subcategoryChartData = {
    labels: subcategoryData.map(item => item.name),
    datasets: [
      {
        label: 'Spending by Subcategory',
        data: subcategoryData.map(item => {
          // If month is selected, filter the data
          if (selectedMonth) {
            return item.transactions
              .filter(t => {
                const monthLabel = t.date.toLocaleDateString('en-US', { 
                  month: 'short', 
                  year: 'numeric' 
                });
                return monthLabel === selectedMonth;
              })
              .reduce((sum, t) => sum + Math.abs(t.amount), 0);
          }
          return item.amount;
        }),
        backgroundColor: [
          'rgba(75, 192, 192, 0.6)',
          'rgba(255, 99, 132, 0.6)', 
          'rgba(255, 206, 86, 0.6)',
          'rgba(54, 162, 235, 0.6)',
          'rgba(153, 102, 255, 0.6)',
          'rgba(255, 159, 64, 0.6)',
          'rgba(199, 199, 199, 0.6)',
          'rgba(83, 102, 255, 0.6)'
        ],
        borderColor: [
          'rgba(75, 192, 192, 1)',
          'rgba(255, 99, 132, 1)',
          'rgba(255, 206, 86, 1)',
          'rgba(54, 162, 235, 1)',
          'rgba(153, 102, 255, 1)',
          'rgba(255, 159, 64, 1)',
          'rgba(199, 199, 199, 1)',
          'rgba(83, 102, 255, 1)'
        ],
        borderWidth: 1
      }
    ]
  };

  // Chart click handlers
  const handleTrendChartClick = (event: any, elements: any[]) => {
    if (elements.length > 0) {
      const index = elements[0].index;
      const clickedLabel = filteredTrendData[index]?.label;
      if (clickedLabel) {
        setSelectedMonth(selectedMonth === clickedLabel ? null : clickedLabel);
      }
    }
  };

  const handleSubcategoryChartClick = (event: any, elements: any[]) => {
    if (elements.length > 0) {
      const index = elements[0].index;
      const clickedSubcategory = subcategoryData[index]?.name;
      if (clickedSubcategory) {
        setSelectedSubcategory(selectedSubcategory === clickedSubcategory ? null : clickedSubcategory);
      }
    }
  };

  return (
    <Modal 
      isOpen={true} 
      onClose={onClose} 
  title={`${categoryName} - Category Drilldown${categoryData?.rangeStart && categoryData?.rangeEnd ? ` (${categoryData.rangeStart.toLocaleDateString()} - ${categoryData.rangeEnd.toLocaleDateString()})` : ''}`}
      maxWidth="1000px"
      maxHeight="90vh"
    >
      {/* Statistics Overview */}
      <StatsGrid>
            <StatCard>
              <div className="stat-label">Total Spent</div>
              <div className="stat-value">{formatCurrency(categoryData.totalAmount)}</div>
            </StatCard>
            
            <StatCard>
              <div className="stat-label">Transactions</div>
              <div className="stat-value">{categoryData.transactionCount}</div>
            </StatCard>
            
            <StatCard>
              <div className="stat-label">Average Transaction</div>
              <div className="stat-value">{formatCurrency(categoryData.averageTransaction)}</div>
            </StatCard>
            
            <StatCard>
              <div className="stat-label">Largest Transaction</div>
              <div className="stat-value">{formatCurrency(Math.abs(categoryData.largestTransaction.amount))}</div>
            </StatCard>
          </StatsGrid>

          {/* Interactive Charts */}
          {categoryData.trend.length > 0 && (
            <ChartsGrid>
              <ChartSection>
                <h3>
                  {categoryData.trendTitle}
                  {selectedSubcategory && ` (${selectedSubcategory})`}
                </h3>
                <ChartContainer>
                  <Line
                    data={trendData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      interaction: {
                        mode: 'index',
                        intersect: false,
                      },
                      plugins: {
                        legend: {
                          display: false
                        },
                        tooltip: {
                          callbacks: {
                            label: (context) => {
                              return `${formatCurrency(Number(context.raw))}`;
                            },
                            afterLabel: (context) => {
                              return 'Click to filter subcategories';
                            }
                          }
                        }
                      },
                      scales: {
                        y: {
                          beginAtZero: true,
                          ticks: {
                            callback: function(value) {
                              return formatCurrency(Number(value));
                            }
                          }
                        }
                      },
                      onClick: handleTrendChartClick
                    }}
                  />
                </ChartContainer>
              </ChartSection>

              <ChartSection>
                <h3>
                  By Subcategory
                  {selectedMonth && ` (${selectedMonth})`}
                </h3>
                <ChartContainer>
                  <Bar
                    data={subcategoryChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      interaction: {
                        mode: 'index',
                        intersect: false,
                      },
                      plugins: {
                        legend: {
                          display: false
                        },
                        tooltip: {
                          callbacks: {
                            label: (context) => {
                              return `${formatCurrency(Number(context.raw))}`;
                            },
                            afterLabel: (context) => {
                              return 'Click to filter monthly trend';
                            }
                          }
                        }
                      },
                      scales: {
                        y: {
                          beginAtZero: true,
                          ticks: {
                            callback: function(value) {
                              return formatCurrency(Number(value));
                            }
                          }
                        }
                      },
                      onClick: handleSubcategoryChartClick
                    }}
                  />
                </ChartContainer>
              </ChartSection>
            </ChartsGrid>
          )}

          {/* Filter Status */}
          {(selectedMonth || selectedSubcategory) && (
            <Card style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f0f7ff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: '600', color: '#333' }}>Active Filters:</span>
                {selectedMonth && (
                  <span style={{ 
                    background: '#2196F3', 
                    color: 'white', 
                    padding: '4px 8px', 
                    borderRadius: '4px', 
                    fontSize: '0.9rem',
                    cursor: 'pointer'
                  }} onClick={() => setSelectedMonth(null)}>
                    Month: {selectedMonth} ✕
                  </span>
                )}
                {selectedSubcategory && (
                  <span style={{ 
                    background: '#4CAF50', 
                    color: 'white', 
                    padding: '4px 8px', 
                    borderRadius: '4px', 
                    fontSize: '0.9rem',
                    cursor: 'pointer'
                  }} onClick={() => setSelectedSubcategory(null)}>
                    Subcategory: {selectedSubcategory} ✕
                  </span>
                )}
                <button
                  style={{
                    background: 'transparent',
                    border: '1px solid #ccc',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '0.9rem',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    setSelectedMonth(null);
                    setSelectedSubcategory(null);
                  }}
                >
                  Clear All
                </button>
              </div>
            </Card>
          )}

          {/* Filtered Transactions */}
          {filteredTransactions.length > 0 && (
            <Card>
              <h3>
                {selectedMonth || selectedSubcategory ? 'Filtered' : 'All'} Transactions ({filteredTransactions.length})
                {selectedMonth && selectedSubcategory && ` - ${selectedMonth} & ${selectedSubcategory}`}
                {selectedMonth && !selectedSubcategory && ` - ${selectedMonth}`}
                {selectedSubcategory && !selectedMonth && ` - ${selectedSubcategory}`}
              </h3>
              <TransactionsList>
                {filteredTransactions.map((transaction, index) => (
                  <div key={index} className="transaction-item">
                    <div className="transaction-info">
                      <div className="description">
                        {transaction.description}
                        {transaction.subcategory && (
                          <span style={{ 
                            marginLeft: '8px', 
                            fontSize: '0.8rem', 
                            color: '#666',
                            background: '#f0f0f0',
                            padding: '2px 6px',
                            borderRadius: '3px'
                          }}>
                            {transaction.subcategory}
                          </span>
                        )}
                      </div>
                      <div className="date">{formatDate(transaction.date)}</div>
                    </div>
                    <TransactionAmount transaction={transaction} />
                  </div>
                ))}
              </TransactionsList>
            </Card>
          )}

          {/* Show message when filters result in no transactions */}
          {filteredTransactions.length === 0 && categoryData.recentTransactions.length > 0 && (selectedMonth || selectedSubcategory) && (
            <Card>
              <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                No transactions found for the selected filters.
                <br />
                <button
                  style={{
                    marginTop: '15px',
                    background: '#2196F3',
                    color: 'white',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    setSelectedMonth(null);
                    setSelectedSubcategory(null);
                  }}
                >
                  Clear Filters
                </button>
              </div>
            </Card>
          )}
    </Modal>
  );
};

export default CategoryDrilldownModal;