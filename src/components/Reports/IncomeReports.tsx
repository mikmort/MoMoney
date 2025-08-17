import React, { useState, useEffect, useCallback, useMemo } from 'react';
import styled from 'styled-components';
import { Line, Bar } from 'react-chartjs-2';
import { Card, Grid } from '../../styles/globalStyles';
import { 
  reportsService, 
  MonthlySpendingTrend,
  IncomeExpenseAnalysis,
  DateRange 
} from '../../services/reportsService';
import { StatsCard } from '../shared/StatsCard';
import TransactionDetailsModal, { TransactionFilter } from './TransactionDetailsModal';
import { currencyDisplayService } from '../../services/currencyDisplayService';
import { MultiSelectFilter } from '../shared/MultiSelectFilter';
import { dataService } from '../../services/dataService';
import { Transaction } from '../../types';

const IncomeContainer = styled.div`
  .date-range-selector {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-bottom: 20px;
    flex-wrap: wrap;
    
    select, input {
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      background: white;
    }
    
    .custom-range {
      display: flex;
      gap: 10px;
      align-items: center;
    }

    .filter-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 140px;
      
      label {
        font-size: 0.85rem;
        color: #666;
        font-weight: 500;
      }
    }
  }
`;

const ChartCard = styled(Card)`
  height: 400px;
  
  .chart-container {
    height: 320px;
    position: relative;
  }
`;

const IncomeSourcesTable = styled.div`
  .source-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid #eee;
    cursor: pointer;
    transition: background-color 0.2s;

    &:hover {
      background-color: #f8f9fa;
      border-radius: 4px;
      margin: 0 -8px;
      padding: 12px 8px;
    }

    &:last-child {
      border-bottom: none;
    }
  }

  .source-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .source-name {
    font-weight: 600;
    color: #333;
  }

  .source-stats {
    font-size: 0.85em;
    color: #666;
  }

  .source-amount {
    text-align: right;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .amount {
    font-weight: 600;
    color: #27ae60;
  }

  .frequency {
    font-size: 0.85em;
    color: #666;
  }
`;

interface IncomeSource {
  categoryName: string;
  amount: number;
  transactionCount: number;
  averageAmount: number;
  frequency: string;
}

const IncomeReports: React.FC = () => {
  const [dateRange, setDateRange] = useState<string>('Last 12 Months');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [includeTransfers, setIncludeTransfers] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [monthlyTrends, setMonthlyTrends] = useState<MonthlySpendingTrend[]>([]);
  const [incomeExpenseAnalysis, setIncomeExpenseAnalysis] = useState<IncomeExpenseAnalysis | null>(null);
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([]);
  const [defaultCurrency, setDefaultCurrency] = useState<string>('USD');
  
  const [transactionDetailsModal, setTransactionDetailsModal] = useState<{
    isOpen: boolean;
    filter: TransactionFilter;
    title: string;
  }>({
    isOpen: false,
    filter: { type: 'category' },
    title: ''
  });

  // Load transactions and compute unique values
  useEffect(() => {
    const loadTransactions = async () => {
      try {
        const allTransactions = await dataService.getAllTransactions();
        setTransactions(allTransactions);
      } catch (error) {
        console.error('Error loading transactions:', error);
      }
    };
    loadTransactions();
  }, []);

  // Compute unique categories and accounts from transactions
  const uniqueCategories = useMemo(() => 
    Array.from(new Set(transactions.map((t: Transaction) => t.category)))
      .sort((a, b) => a.localeCompare(b)), 
    [transactions]
  );
  
  const uniqueAccounts = useMemo(() => 
    Array.from(new Set(transactions.map((t: Transaction) => t.account))),
    [transactions]
  );

  useEffect(() => {
    (async () => {
      setDefaultCurrency(await currencyDisplayService.getDefaultCurrency());
    })();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: defaultCurrency
    }).format(amount);
  };

  // Get current date range for API calls
  const getCurrentDateRange = useCallback((): DateRange | undefined => {
    if (dateRange === 'All Time') {
      return undefined;
    }
    
    if (dateRange === 'Custom Range') {
      if (!customStartDate || !customEndDate) return undefined;
      return {
        startDate: new Date(customStartDate),
        endDate: new Date(customEndDate)
      };
    }
    
    if (dateRange === 'Current Month') {
      return reportsService.getCurrentMonthRange();
    }
    
    if (dateRange === 'Last 3 Months') {
      return reportsService.getLastThreeMonthsRange();
    }
    
    // Default: Last 12 Months
    return reportsService.getDefaultDateRange();
  }, [dateRange, customStartDate, customEndDate]);

  // Load income data
  const loadIncomeData = useCallback(async () => {
    try {
      const currentRange = getCurrentDateRange();
      
      // Get the raw data first
      const [trendsData, analysisData, incomeSourcesData] = await Promise.all([
        reportsService.getMonthlySpendingTrends(currentRange, includeTransfers),
        reportsService.getIncomeExpenseAnalysis(currentRange, includeTransfers),
        reportsService.getIncomeByCategory(currentRange, includeTransfers)
      ]);
      
      setMonthlyTrends(trendsData);
      setIncomeExpenseAnalysis(analysisData);
      setIncomeSources(incomeSourcesData);
    } catch (error) {
      console.error('Error loading income data:', error);
      // Fallback to basic data if income-specific methods don't exist
      const currentRange = getCurrentDateRange();
      const [trendsData, analysisData] = await Promise.all([
        reportsService.getMonthlySpendingTrends(currentRange, includeTransfers),
        reportsService.getIncomeExpenseAnalysis(currentRange, includeTransfers)
      ]);
      
      setMonthlyTrends(trendsData);
      setIncomeExpenseAnalysis(analysisData);
      setIncomeSources([]);
    }
  }, [getCurrentDateRange, includeTransfers]);

  // Filter income sources based on selected categories
  const filteredIncomeSources = useMemo(() => {
    if (selectedCategories.length === 0) {
      return incomeSources;
    }
    return incomeSources.filter(source => selectedCategories.includes(source.categoryName));
  }, [incomeSources, selectedCategories]);

  useEffect(() => {
    loadIncomeData();
  }, [loadIncomeData]);

  // Chart data preparation
  const incomeTrendData = {
    labels: monthlyTrends.map(trend => `${trend.month} ${trend.year}`),
    datasets: [{
      label: 'Monthly Income',
      data: monthlyTrends.map(trend => trend.totalIncome),
      borderColor: '#27ae60',
      backgroundColor: 'rgba(39, 174, 96, 0.1)',
      borderWidth: 3,
      fill: true,
      tension: 0.4,
    }]
  };

  const incomeVsExpenseData = {
    labels: monthlyTrends.map(trend => `${trend.month} ${trend.year}`),
    datasets: [
      {
        label: 'Income',
        data: monthlyTrends.map(trend => trend.totalIncome),
        backgroundColor: '#27ae60',
        borderColor: '#219a52',
        borderWidth: 2,
      },
      {
        label: 'Expenses',
        data: monthlyTrends.map(trend => trend.totalSpending),
        backgroundColor: '#e74c3c',
        borderColor: '#c0392b',
        borderWidth: 2,
      }
    ]
  };

  const calculateGrowthRate = () => {
    if (monthlyTrends.length < 2) return 0;
    const recent = monthlyTrends.slice(-2);
    if (recent[0].totalIncome === 0) return 0;
    return ((recent[1].totalIncome - recent[0].totalIncome) / recent[0].totalIncome) * 100;
  };

  const getConsistencyScore = () => {
    if (monthlyTrends.length < 3) return 100;
    const incomes = monthlyTrends.map(t => t.totalIncome);
    const average = incomes.reduce((sum, income) => sum + income, 0) / incomes.length;
    const variance = incomes.reduce((sum, income) => sum + Math.pow(income - average, 2), 0) / incomes.length;
    const standardDeviation = Math.sqrt(variance);
    const coefficient = average > 0 ? (standardDeviation / average) * 100 : 0;
    return Math.max(0, 100 - coefficient);
  };

  return (
    <IncomeContainer>
      {/* Date Range Controls */}
      <Card>
        <h3>Date Range</h3>
        <div className="date-range-selector">
          <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
            <option>All Time</option>
            <option>Current Month</option>
            <option>Last 3 Months</option>
            <option>Last 12 Months</option>
            <option>Custom Range</option>
          </select>

          {dateRange === 'Custom Range' && (
            <div className="custom-range">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                placeholder="Start Date"
              />
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                placeholder="End Date"
              />
            </div>
          )}
          
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={includeTransfers}
              onChange={(e) => setIncludeTransfers(e.target.checked)}
            />
            Include Internal Transfers
          </label>

          <div className="filter-group">
            <label>Categories</label>
            <MultiSelectFilter
              label="Categories"
              options={uniqueCategories}
              selectedValues={selectedCategories}
              onChange={setSelectedCategories}
              placeholder="All Categories"
            />
          </div>
          
          <div className="filter-group">
            <label>Accounts</label>
            <MultiSelectFilter
              label="Accounts"
              options={uniqueAccounts}
              selectedValues={selectedAccounts}
              onChange={setSelectedAccounts}
              placeholder="All Accounts"
            />
          </div>
        </div>
      </Card>

      {/* Income Overview Stats */}
      {incomeExpenseAnalysis && (
        <Grid columns={4} gap="20px">
          <StatsCard>
            <div className="label">Total Income</div>
            <div className="amount positive">{formatCurrency(incomeExpenseAnalysis.totalIncome)}</div>
          </StatsCard>
          
          <StatsCard>
            <div className="label">Average Monthly Income</div>
            <div className="amount positive">
              {monthlyTrends.length > 0 
                ? formatCurrency(monthlyTrends.reduce((sum, t) => sum + t.totalIncome, 0) / monthlyTrends.length)
                : formatCurrency(0)
              }
            </div>
          </StatsCard>
          
          <StatsCard>
            <div className="label">Income Growth Rate</div>
            <div className={`amount ${calculateGrowthRate() >= 0 ? 'positive' : 'negative'}`}>
              {calculateGrowthRate() >= 0 ? '📈' : '📉'} {Math.abs(calculateGrowthRate()).toFixed(1)}%
            </div>
          </StatsCard>
          
          <StatsCard>
            <div className="label">Income Consistency</div>
            <div className="amount neutral">
              {getConsistencyScore() >= 80 ? '🟢' : getConsistencyScore() >= 60 ? '🟡' : '🔴'} {getConsistencyScore().toFixed(0)}%
            </div>
          </StatsCard>
        </Grid>
      )}

      {/* Charts Grid */}
      <Grid columns={2} gap="20px">
        {/* Income Trend Chart */}
        <ChartCard>
          <h3>Income Trend Over Time</h3>
          <div className="chart-container">
            {monthlyTrends.length > 0 ? (
              <Line 
                key={`income-trend-chart-${monthlyTrends.length}`}
                data={incomeTrendData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      display: false,
                    },
                    tooltip: {
                      callbacks: {
                        label: function(context) {
                          return `Income: ${formatCurrency(context.parsed.y)}`;
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
                  }
                }}
              />
            ) : (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                height: '100%',
                color: '#666',
                textAlign: 'center'
              }}>
                No income trend data available.
              </div>
            )}
          </div>
        </ChartCard>

        {/* Income vs Expenses Comparison */}
        <ChartCard>
          <h3>Income vs Expenses</h3>
          <div className="chart-container">
            {monthlyTrends.length > 0 ? (
              <Bar 
                key={`income-vs-expenses-chart-${monthlyTrends.length}`}
                data={incomeVsExpenseData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'top',
                    },
                    tooltip: {
                      callbacks: {
                        label: function(context) {
                          return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
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
                  }
                }}
              />
            ) : (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                height: '100%',
                color: '#666',
                textAlign: 'center'
              }}>
                No comparison data available.
              </div>
            )}
          </div>
        </ChartCard>
      </Grid>

      {/* Income Sources Breakdown */}
      {filteredIncomeSources.length > 0 && (
        <Card>
          <h3>Income Sources</h3>
          <IncomeSourcesTable>
            {filteredIncomeSources.map((source, index) => (
              <div 
                key={index} 
                className="source-row"
                onClick={() => setTransactionDetailsModal({
                  isOpen: true,
                  filter: { type: 'category', category: source.categoryName },
                  title: `${source.categoryName} Income Transactions`
                })}
                title={`Click to view ${source.categoryName} transactions`}
              >
                <div className="source-info">
                  <div className="source-name">{source.categoryName}</div>
                  <div className="source-stats">
                    {source.transactionCount} transactions • Avg: {formatCurrency(source.averageAmount)}
                  </div>
                </div>
                <div className="source-amount">
                  <div className="amount">{formatCurrency(source.amount)}</div>
                  <div className="frequency">{source.frequency}</div>
                </div>
              </div>
            ))}
          </IncomeSourcesTable>
        </Card>
      )}

      {/* Key Insights */}
      {incomeExpenseAnalysis && monthlyTrends.length > 0 && (
        <Card>
          <h3>💡 Income Insights</h3>
          <Grid columns={1} gap="10px">
            {incomeExpenseAnalysis.savingsRate >= 0 && (
              <div style={{ padding: '10px', backgroundColor: '#d4edda', borderRadius: '4px', color: '#155724' }}>
                <strong>Positive Savings Rate:</strong> You're saving {incomeExpenseAnalysis.savingsRate.toFixed(1)}% of your income - great job!
              </div>
            )}
            
            {incomeExpenseAnalysis.savingsRate < 0 && (
              <div style={{ padding: '10px', backgroundColor: '#f8d7da', borderRadius: '4px', color: '#721c24' }}>
                <strong>Spending Exceeds Income:</strong> Consider reviewing your expenses or finding ways to increase income.
              </div>
            )}
            
            {getConsistencyScore() >= 80 && (
              <div style={{ padding: '10px', backgroundColor: '#d1ecf1', borderRadius: '4px', color: '#0c5460' }}>
                <strong>Consistent Income:</strong> Your income shows good stability with {getConsistencyScore().toFixed(0)}% consistency.
              </div>
            )}
            
            {calculateGrowthRate() > 10 && (
              <div style={{ padding: '10px', backgroundColor: '#d4edda', borderRadius: '4px', color: '#155724' }}>
                <strong>Income Growth:</strong> Your income has grown {calculateGrowthRate().toFixed(1)}% recently - excellent trend!
              </div>
            )}
          </Grid>
        </Card>
      )}

      {/* Transaction Details Modal */}
      <TransactionDetailsModal
        isOpen={transactionDetailsModal.isOpen}
        onClose={() => setTransactionDetailsModal(prev => ({ ...prev, isOpen: false }))}
        filter={transactionDetailsModal.filter}
        title={transactionDetailsModal.title}
      />
    </IncomeContainer>
  );
};

export default IncomeReports;