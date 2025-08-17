import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { Bar, Doughnut } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
import { PageHeader, Card, Grid, Badge } from '../../styles/globalStyles';
import { 
  reportsService, 
  SpendingByCategory, 
  MonthlySpendingTrend, 
  IncomeExpenseAnalysis,
  SpendingInsights,
  BurnRateAnalysis,
  DateRange 
} from '../../services/reportsService';
import { StatsCard } from '../shared/StatsCard';
import { MultiSelectFilter } from '../shared/MultiSelectFilter';
import CategoryDrilldownModal from './CategoryDrilldownModal';
import TransactionDetailsModal, { TransactionFilter } from './TransactionDetailsModal';
import { currencyDisplayService } from '../../services/currencyDisplayService';

const ReportsContainer = styled.div`
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
  }
`;

const ChartCard = styled(Card)`
  height: 400px;
  
  .chart-container {
    height: 320px;
    position: relative;
  }
  
  h3 {
    margin-bottom: 20px;
    color: #333;
  }
`;

const InsightsCard = styled(Card)`
  .insight-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid #eee;
    
    &:last-child {
      border-bottom: none;
    }
  }
  
  .insight-label {
    font-weight: 500;
    color: #333;
  }
  
  .insight-value {
    font-weight: 600;
    
    &.good {
      color: #4caf50;
    }
    
    &.warning {
      color: #ff9800;
    }
    
    &.error {
      color: #f44336;
    }
  }
`;

const CategoryTable = styled.div`
  .category-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid #eee;
    cursor: pointer;
    transition: background-color 0.2s ease;
    
    &:hover {
      background-color: #f5f5f5;
      border-radius: 4px;
      margin: 0 -8px;
      padding: 12px 8px;
    }
    
    &:last-child {
      border-bottom: none;
    }
  }
  
  .category-info {
    flex: 1;
    
    .category-name {
      font-weight: 500;
      margin-bottom: 4px;
      color: #2196f3;
      
      &:hover {
        text-decoration: underline;
      }
    }
    
    .category-stats {
      font-size: 0.85rem;
      color: #666;
    }
  }
  
  .category-amount {
    text-align: right;
    
    .amount {
      font-weight: 600;
      color: #f44336;
      margin-bottom: 4px;
    }
    
    .percentage {
      font-size: 0.85rem;
      color: #888;
    }
  }
`;

const BurnRateCard = styled(Card)`
  .burn-rate-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
  }
  
  .burn-rate-item {
    text-align: center;
    
    .value {
      font-size: 1.4rem;
      font-weight: 600;
      margin: 8px 0;
      
      &.positive {
        color: #4caf50;
      }
      
      &.negative {
        color: #f44336;
      }
      
      &.warning {
        color: #ff9800;
      }
      
      &.neutral {
        color: #2196f3;
      }
    }
    
    .label {
      color: #666;
      font-size: 0.9rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .trend {
      font-size: 0.8rem;
      margin-top: 4px;
      
      &.increasing {
        color: #f44336;
      }
      
      &.decreasing {
        color: #4caf50;
      }
      
      &.stable {
        color: #666;
      }
    }
  }
`;

type DateRangeType = 'all' | 'current-month' | 'last-3-months' | 'last-12-months' | 'custom';

const Reports: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [dateRangeType, setDateRangeType] = useState<DateRangeType>('last-12-months');
  const [customDateRange, setCustomDateRange] = useState<DateRange | null>(null);
  const [selectedTransactionTypes, setSelectedTransactionTypes] = useState<string[]>(['income', 'expense']);
  const [spendingByCategory, setSpendingByCategory] = useState<SpendingByCategory[]>([]);
  const [monthlyTrends, setMonthlyTrends] = useState<MonthlySpendingTrend[]>([]);
  const [incomeExpenseAnalysis, setIncomeExpenseAnalysis] = useState<IncomeExpenseAnalysis | null>(null);
  const [spendingInsights, setSpendingInsights] = useState<SpendingInsights | null>(null);
  const [burnRateAnalysis, setBurnRateAnalysis] = useState<BurnRateAnalysis | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  // State for the new transaction details modal
  const [transactionDetailsModal, setTransactionDetailsModal] = useState<{
    isOpen: boolean;
    filter: TransactionFilter;
    title: string;
  }>({
    isOpen: false,
    filter: { type: 'category' },
    title: ''
  });

  const getCurrentDateRange = useCallback((): DateRange | undefined => {
    switch (dateRangeType) {
      case 'all':
        return undefined;
      case 'current-month':
        return reportsService.getCurrentMonthRange();
      case 'last-3-months':
        return reportsService.getLastThreeMonthsRange();
      case 'last-12-months':
        return reportsService.getDefaultDateRange();
      case 'custom':
        return customDateRange || undefined;
      default:
        return undefined;
    }
  }, [dateRangeType, customDateRange]);

  useEffect(() => {
    const loadReportsData = async () => {
      setLoading(true);
      try {
        const dateRange = getCurrentDateRange();
        
        const [categoryData, trendsData, analysisData, insightsData, burnRateData] = await Promise.all([
          reportsService.getSpendingByCategory(dateRange, selectedTransactionTypes),
          reportsService.getMonthlySpendingTrends(dateRange, selectedTransactionTypes),
          reportsService.getIncomeExpenseAnalysis(dateRange, selectedTransactionTypes),
          reportsService.getSpendingInsights(dateRange, selectedTransactionTypes.includes('transfer')),
          reportsService.getBurnRateAnalysis(dateRange, selectedTransactionTypes.includes('transfer'))
        ]);
        
        setSpendingByCategory(categoryData);
        setMonthlyTrends(trendsData);
        setIncomeExpenseAnalysis(analysisData);
        setSpendingInsights(insightsData);
        setBurnRateAnalysis(burnRateData);
      } catch (error) {
        console.error('Failed to load reports data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadReportsData();
  }, [dateRangeType, customDateRange, selectedTransactionTypes, getCurrentDateRange]);

  const [defaultCurrency, setDefaultCurrency] = useState<string>('USD');
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

  const formatPercentage = (percentage: number) => {
    return `${percentage.toFixed(1)}%`;
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'increasing': return '📈';
      case 'decreasing': return '📉';
      default: return '➡️';
    }
  };

  const getTrendText = (trend: string) => {
    switch (trend) {
      case 'increasing': return 'Increasing';
      case 'decreasing': return 'Decreasing';
      default: return 'Stable';
    }
  };

  // Helper function to create date range from month label
  const createDateRangeFromMonth = (monthLabel: string): { startDate: Date; endDate: Date } => {
    // Parse month label like "Jul 2025" or "2025-07"
    let year: number;
    let month: number;
    
    if (monthLabel.includes(' ')) {
      // Format: "Jul 2025"
      const [monthName, yearStr] = monthLabel.split(' ');
      year = parseInt(yearStr);
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                         'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      month = monthNames.indexOf(monthName);
    } else if (monthLabel.includes('-')) {
      // Format: "2025-07"
      const [yearStr, monthStr] = monthLabel.split('-');
      year = parseInt(yearStr);
      month = parseInt(monthStr) - 1; // JavaScript months are 0-based
    } else {
      // Fallback: assume current year and try to parse month name
      year = new Date().getFullYear();
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                         'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      month = monthNames.indexOf(monthLabel);
      if (month === -1) month = 0; // Default to January if parsing fails
    }
    
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0); // Last day of the month
    
    return { startDate, endDate };
  };

  // Chart click handlers
  const handleCategoryChartClick = (event: any, elements: any[]) => {
    if (elements.length > 0) {
      const elementIndex = elements[0].index;
      const categoryName = spendingByCategory[elementIndex]?.categoryName;
      
      if (categoryName) {
        setTransactionDetailsModal({
          isOpen: true,
          filter: { type: 'category', category: categoryName },
          title: `${categoryName} - Transaction Details`
        });
      }
    }
  };

  const handleTrendsChartClick = (event: any, elements: any[]) => {
    if (elements.length > 0) {
      const elementIndex = elements[0].index;
      const datasetIndex = elements[0].datasetIndex;
      const monthLabel = monthlyTrends[elementIndex]?.month;
      
      if (monthLabel) {
        const dateRange = createDateRangeFromMonth(monthLabel);
        const transactionType = datasetIndex === 0 ? 'income' : 'expense';
        const typeLabel = transactionType === 'income' ? 'Income' : 'Expenses';
        
        setTransactionDetailsModal({
          isOpen: true,
          filter: { 
            type: 'month-type', 
            month: monthLabel,
            transactionType,
            dateRange
          },
          title: `${monthLabel} ${typeLabel} - Transaction Details`
        });
      }
    }
  };

  const handleNetIncomeChartClick = (event: any, elements: any[]) => {
    if (elements.length > 0) {
      const elementIndex = elements[0].index;
      const monthLabel = monthlyTrends[elementIndex]?.month;
      
      if (monthLabel) {
        const dateRange = createDateRangeFromMonth(monthLabel);
        
        setTransactionDetailsModal({
          isOpen: true,
          filter: { 
            type: 'month',
            month: monthLabel,
            dateRange
          },
          title: `${monthLabel} - All Transactions`
        });
      }
    }
  };

  // Chart data preparations
  const categoryChartData = {
    labels: spendingByCategory.slice(0, 6).map(cat => cat.categoryName),
    datasets: [
      {
        data: spendingByCategory.slice(0, 6).map(cat => cat.amount),
        backgroundColor: [
          '#FF6384',
          '#36A2EB',
          '#FFCE56',
          '#4BC0C0',
          '#9966FF',
          '#FF9F40'
        ],
        borderWidth: 2,
        borderColor: '#fff'
      }
    ]
  };

  const trendsChartData = {
    labels: monthlyTrends.map(trend => trend.month),
    datasets: [
      {
        label: 'Income',
        data: monthlyTrends.map(trend => trend.totalIncome),
        backgroundColor: 'rgba(75, 192, 192, 0.6)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 2
      },
      {
        label: 'Expenses',
        data: monthlyTrends.map(trend => trend.totalSpending),
        backgroundColor: 'rgba(255, 99, 132, 0.6)',
        borderColor: 'rgba(255, 99, 132, 1)',
        borderWidth: 2
      }
    ]
  };

  const netIncomeChartData = {
    labels: monthlyTrends.map(trend => trend.month),
    datasets: [
      {
        label: 'Net Income',
        data: monthlyTrends.map(trend => trend.netAmount),
        backgroundColor: monthlyTrends.map(trend => 
          trend.netAmount >= 0 ? 'rgba(75, 192, 192, 0.6)' : 'rgba(255, 99, 132, 0.6)'
        ),
        borderColor: monthlyTrends.map(trend => 
          trend.netAmount >= 0 ? 'rgba(75, 192, 192, 1)' : 'rgba(255, 99, 132, 1)'
        ),
        borderWidth: 2
      }
    ]
  };

  if (loading) {
    return (
      <ReportsContainer>
        <PageHeader>
          <h1>Reports</h1>
        </PageHeader>
        <Card>
          <div style={{ textAlign: 'center', padding: '40px' }}>
            Loading reports data...
          </div>
        </Card>
      </ReportsContainer>
    );
  }

  return (
    <ReportsContainer>
      <PageHeader>
        <h1>Reports</h1>
        <Badge variant="info">Spending Analysis & Insights</Badge>
      </PageHeader>

      <Card>
        <h3>Date Range</h3>
        <div className="date-range-selector">
          <select 
            value={dateRangeType} 
            onChange={(e) => setDateRangeType(e.target.value as DateRangeType)}
          >
            <option value="all">All Time</option>
            <option value="current-month">Current Month</option>
            <option value="last-3-months">Last 3 Months</option>
            <option value="last-12-months">Last 12 Months</option>
            <option value="custom">Custom Range</option>
          </select>
          
          {dateRangeType === 'custom' && (
            <div className="custom-range">
              <input
                type="date"
                onChange={(e) => setCustomDateRange(prev => ({
                  ...prev,
                  startDate: new Date(e.target.value)
                } as DateRange))}
              />
              <span>to</span>
              <input
                type="date"
                onChange={(e) => setCustomDateRange(prev => ({
                  ...prev,
                  endDate: new Date(e.target.value)
                } as DateRange))}
              />
            </div>
          )}
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label>Transaction Types</label>
            <MultiSelectFilter
              label="Transaction Types"
              options={['income', 'expense', 'transfer', 'asset-allocation']}
              selectedValues={selectedTransactionTypes}
              onChange={setSelectedTransactionTypes}
              placeholder="Select types..."
            />
          </div>
        </div>
      </Card>

      {/* Overview Stats */}
      {incomeExpenseAnalysis && (
        <Grid columns={4} gap="20px">
          <StatsCard>
            <div className="label">Total Income</div>
            <div className="amount positive">{formatCurrency(incomeExpenseAnalysis.totalIncome)}</div>
          </StatsCard>
          
          <StatsCard>
            <div className="label">Total Expenses</div>
            <div className="amount negative">{formatCurrency(incomeExpenseAnalysis.totalExpenses)}</div>
          </StatsCard>
          
          <StatsCard>
            <div className="label">Net Income</div>
            <div className={`amount ${incomeExpenseAnalysis.netIncome >= 0 ? 'positive' : 'negative'}`}>
              {formatCurrency(incomeExpenseAnalysis.netIncome)}
            </div>
          </StatsCard>
          
          <StatsCard>
            <div className="label">Savings Rate</div>
            <div className={`amount ${incomeExpenseAnalysis.savingsRate >= 0 ? 'positive' : 'negative'}`}>
              {formatPercentage(incomeExpenseAnalysis.savingsRate)}
            </div>
            <div className="percentage">of income saved</div>
          </StatsCard>
        </Grid>
      )}

      {/* Burn Rate Analysis */}
      {burnRateAnalysis && (
        <BurnRateCard>
          <h3>💸 Burn Rate Analysis</h3>
          <div className="burn-rate-grid">
            <div className="burn-rate-item">
              <div className="label">Daily Burn Rate</div>
              <div className="value negative">{formatCurrency(burnRateAnalysis.dailyBurnRate)}</div>
            </div>
            
            <div className="burn-rate-item">
              <div className="label">Monthly Burn Rate</div>
              <div className="value negative">{formatCurrency(burnRateAnalysis.monthlyBurnRate)}</div>
            </div>
            
            <div className="burn-rate-item">
              <div className="label">Projected Month-End Balance</div>
              <div className={`value ${burnRateAnalysis.projectedEndOfMonthBalance >= 0 ? 'positive' : 'negative'}`}>
                {formatCurrency(burnRateAnalysis.projectedEndOfMonthBalance)}
              </div>
            </div>
            
            <div className="burn-rate-item">
              <div className="label">Spending Trend</div>
              <div className={`value ${burnRateAnalysis.burnRateTrend === 'decreasing' ? 'positive' : burnRateAnalysis.burnRateTrend === 'increasing' ? 'negative' : 'neutral'}`}>
                {getTrendIcon(burnRateAnalysis.burnRateTrend)}
              </div>
              <div className={`trend ${burnRateAnalysis.burnRateTrend}`}>
                {getTrendText(burnRateAnalysis.burnRateTrend)}
              </div>
            </div>
          </div>
        </BurnRateCard>
      )}

      <Grid columns={2} gap="20px">
        {/* Spending by Category Chart */}
        <ChartCard>
          <h3>Spending by Category</h3>
          <div className="chart-container">
            {spendingByCategory.length > 0 ? (
              <Doughnut 
                key={`category-chart-${spendingByCategory.length}`} // Ensure unique key for chart re-rendering
                data={categoryChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  onClick: handleCategoryChartClick,
                  interaction: {
                    intersect: true,
                    mode: 'nearest'
                  },
                  plugins: {
                    legend: {
                      position: 'bottom',
                    },
                    tooltip: {
                      callbacks: {
                        label: function(context) {
                          const value = context.parsed;
                          const total = spendingByCategory.reduce((sum, cat) => sum + cat.amount, 0);
                          const percentage = ((value / total) * 100).toFixed(1);
                          return `${context.label}: ${formatCurrency(value)} (${percentage}%)`;
                        },
                        afterLabel: function() {
                          return 'Click to view transactions';
                        }
                      }
                    }
                  },
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
                No expense data available for selected period.
              </div>
            )}
          </div>
        </ChartCard>

        {/* Monthly Trends */}
        <ChartCard>
          <h3>Monthly Income vs Expenses</h3>
          <div className="chart-container">
            {monthlyTrends.length > 0 ? (
              <Bar 
                key={`trends-chart-${monthlyTrends.length}`} // Ensure unique key for chart re-rendering
                data={trendsChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  onClick: handleTrendsChartClick,
                  interaction: {
                    intersect: true,
                    mode: 'nearest'
                  },
                  plugins: {
                    legend: {
                      position: 'top',
                    },
                    tooltip: {
                      callbacks: {
                        afterLabel: function() {
                          return 'Click to view transactions';
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
                No monthly trend data available.
              </div>
            )}
          </div>
        </ChartCard>
      </Grid>

      <Grid columns={2} gap="20px">
        {/* Net Income Trend */}
        <ChartCard>
          <h3>Net Income Trend</h3>
          <div className="chart-container">
            {monthlyTrends.length > 0 ? (
              <Bar 
                key={`net-income-chart-${monthlyTrends.length}`} // Ensure unique key for chart re-rendering
                data={netIncomeChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  onClick: handleNetIncomeChartClick,
                  interaction: {
                    intersect: true,
                    mode: 'nearest'
                  },
                  plugins: {
                    legend: {
                      display: false,
                    },
                    tooltip: {
                      callbacks: {
                        label: function(context) {
                          const value = context.parsed.y;
                          const status = value >= 0 ? 'surplus' : 'deficit';
                          return `Net ${status}: ${formatCurrency(Math.abs(value))}`;
                        },
                        afterLabel: function() {
                          return 'Click to view all transactions';
                        }
                      }
                    }
                  },
                  scales: {
                    y: {
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
                No net income data available.
              </div>
            )}
          </div>
        </ChartCard>

        {/* Spending Insights */}
        {spendingInsights && (
          <InsightsCard>
            <h3>Data Quality Insights</h3>
            <div className="insight-item">
              <span className="insight-label">Total Transactions</span>
              <span className="insight-value neutral">{spendingInsights.totalTransactions}</span>
            </div>
            <div className="insight-item">
              <span className="insight-label">Verified Transactions</span>
              <span className={`insight-value ${spendingInsights.verificationRate > 80 ? 'good' : spendingInsights.verificationRate > 50 ? 'warning' : 'error'}`}>
                {spendingInsights.verifiedTransactions} ({formatPercentage(spendingInsights.verificationRate)})
              </span>
            </div>
            <div className="insight-item">
              <span className="insight-label">Average AI Confidence</span>
              <span className={`insight-value ${spendingInsights.averageConfidence > 80 ? 'good' : spendingInsights.averageConfidence > 60 ? 'warning' : 'error'}`}>
                {formatPercentage(spendingInsights.averageConfidence)}
              </span>
            </div>
            <div className="insight-item">
              <span className="insight-label">High Confidence</span>
              <span className="insight-value good">{spendingInsights.highConfidenceTransactions}</span>
            </div>
            <div className="insight-item">
              <span className="insight-label">Needs Review</span>
              <span className={`insight-value ${spendingInsights.needsReviewCount === 0 ? 'good' : 'warning'}`}>
                {spendingInsights.needsReviewCount}
              </span>
            </div>
          </InsightsCard>
        )}
      </Grid>

      {/* Category Breakdown Table */}
      {spendingByCategory.length > 0 && (
        <Card>
          <h3>Category Breakdown (Click for Details)</h3>
          <CategoryTable>
            {spendingByCategory.map((category, index) => (
              <div 
                key={index} 
                className="category-row"
                onClick={() => setSelectedCategory(category.categoryName)}
                title={`Click to view detailed analysis of ${category.categoryName}`}
              >
                <div className="category-info">
                  <div className="category-name">{category.categoryName}</div>
                  <div className="category-stats">
                    {category.transactionCount} transactions • Avg: {formatCurrency(category.averageAmount)}
                  </div>
                </div>
                <div className="category-amount">
                  <div className="amount">{formatCurrency(category.amount)}</div>
                  <div className="percentage">{formatPercentage(category.percentage)}</div>
                </div>
              </div>
            ))}
          </CategoryTable>
        </Card>
      )}

      {/* Category Drilldown Modal */}
      {selectedCategory && (
        <CategoryDrilldownModal
          categoryName={selectedCategory}
          dateRange={getCurrentDateRange()}
          includeTransfers={selectedTransactionTypes.includes('transfer')}
          onClose={() => setSelectedCategory(null)}
        />
      )}

      {/* Transaction Details Modal */}
      <TransactionDetailsModal
        isOpen={transactionDetailsModal.isOpen}
        onClose={() => setTransactionDetailsModal(prev => ({ ...prev, isOpen: false }))}
        filter={transactionDetailsModal.filter}
        title={transactionDetailsModal.title}
      />
    </ReportsContainer>
  );
};

export default Reports;
