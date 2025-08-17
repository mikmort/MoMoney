import React, { useState, useEffect, useCallback, useMemo } from 'react';
import styled from 'styled-components';
import { Doughnut, Bar } from 'react-chartjs-2';
import { Card, Grid } from '../../styles/globalStyles';
import { 
  reportsService, 
  SpendingByCategory, 
  MonthlySpendingTrend,
  IncomeExpenseAnalysis,
  BurnRateAnalysis,
  DateRange 
} from '../../services/reportsService';
import { StatsCard } from '../shared/StatsCard';
import { MultiSelectFilter } from '../shared/MultiSelectFilter';
import CategoryDrilldownModal from './CategoryDrilldownModal';
import TransactionDetailsModal, { TransactionFilter } from './TransactionDetailsModal';
import { currencyDisplayService } from '../../services/currencyDisplayService';
import { dataService } from '../../services/dataService';
import { Transaction } from '../../types';

const SpendingContainer = styled.div`
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

const CategoryTable = styled.div`
  .category-row {
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

  .category-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .category-name {
    font-weight: 600;
    color: #333;
  }

  .category-stats {
    font-size: 0.85em;
    color: #666;
  }

  .category-amount {
    text-align: right;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .amount {
    font-weight: 600;
    color: #e74c3c;
  }

  .percentage {
    font-size: 0.85em;
    color: #666;
  }
`;

const SpendingReports: React.FC = () => {
  const [dateRange, setDateRange] = useState<string>('Last 12 Months');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [selectedSpendingTypes, setSelectedSpendingTypes] = useState<string[]>(['expense']);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [spendingByCategory, setSpendingByCategory] = useState<SpendingByCategory[]>([]);
  const [monthlyTrends, setMonthlyTrends] = useState<MonthlySpendingTrend[]>([]);
  const [incomeExpenseAnalysis, setIncomeExpenseAnalysis] = useState<IncomeExpenseAnalysis | null>(null);
  const [burnRateAnalysis, setBurnRateAnalysis] = useState<BurnRateAnalysis | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
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
  const formatPercentage = (value: number) => `${value.toFixed(1)}%`;

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
    
    if (dateRange === 'Current Year') {
      return reportsService.getCurrentYearRange();
    }
    
    if (dateRange === 'Previous Year') {
      return reportsService.getPreviousYearRange();
    }
    
    if (dateRange === 'Year Before That') {
      return reportsService.getYearBeforeLastRange();
    }
    
    // Default: Last 12 Months
    return reportsService.getDefaultDateRange();
  }, [dateRange, customStartDate, customEndDate]);

  // Load spending data
  const loadSpendingData = useCallback(async () => {
    try {
      const currentRange = getCurrentDateRange();
      
      const [categoryData, trendsData, analysisData, burnData] = await Promise.all([
        reportsService.getSpendingByCategory(currentRange, selectedSpendingTypes),
        reportsService.getMonthlySpendingTrends(currentRange, selectedSpendingTypes),
        reportsService.getIncomeExpenseAnalysis(currentRange, selectedSpendingTypes),
        reportsService.getBurnRateAnalysis(currentRange, selectedSpendingTypes.includes('transfer'))
      ]);
      
      setSpendingByCategory(categoryData);
      setMonthlyTrends(trendsData);
      setIncomeExpenseAnalysis(analysisData);
      setBurnRateAnalysis(burnData);
    } catch (error) {
      console.error('Error loading spending data:', error);
    }
  }, [getCurrentDateRange, selectedSpendingTypes]);

  // Filter spending categories based on selected categories
  const filteredSpendingByCategory = useMemo(() => {
    if (selectedCategories.length === 0) {
      return spendingByCategory;
    }
    return spendingByCategory.filter(category => selectedCategories.includes(category.categoryName));
  }, [spendingByCategory, selectedCategories]);

  useEffect(() => {
    loadSpendingData();
  }, [loadSpendingData]);

  // Chart data preparation
  const categoryChartData = {
    labels: filteredSpendingByCategory.map(cat => cat.categoryName),
    datasets: [{
      data: filteredSpendingByCategory.map(cat => cat.amount),
      backgroundColor: [
        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
        '#FF9F40', '#FF6384', '#C9CBCF', '#4BC0C0', '#FF6384'
      ],
      borderWidth: 2,
      borderColor: '#fff'
    }]
  };

  const spendingTrendData = {
    labels: monthlyTrends.map(trend => `${trend.month} ${trend.year}`),
    datasets: [{
      label: 'Monthly Spending',
      data: monthlyTrends.map(trend => trend.totalSpending),
      backgroundColor: '#e74c3c',
      borderColor: '#c0392b',
      borderWidth: 2,
    }]
  };

  const handleCategoryChartClick = (event: any, elements: any) => {
    if (elements.length > 0) {
      const index = elements[0].index;
      const categoryName = filteredSpendingByCategory[index].categoryName;
      setSelectedCategory(categoryName);
    }
  };

  return (
    <SpendingContainer>
      {/* Date Range Controls */}
      <Card>
        <h3>Date Range</h3>
        <div className="date-range-selector">
          <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
            <option>All Time</option>
            <option>Current Month</option>
            <option>Last 3 Months</option>
            <option>Last 12 Months</option>
            <option>Current Year</option>
            <option>Previous Year</option>
            <option>Year Before That</option>
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
          
          <div className="filter-group">
            <label>Spending Types</label>
            <MultiSelectFilter
              label="Spending Types"
              options={['expense', 'transfer', 'asset-allocation']}
              selectedValues={selectedSpendingTypes}
              onChange={setSelectedSpendingTypes}
              placeholder="Select types..."
            />
          </div>

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

      {/* Spending Overview Stats */}
      {incomeExpenseAnalysis && (
        <Grid columns={4} gap="20px">
          <StatsCard>
            <div className="label">Total Expenses</div>
            <div className="amount negative">{formatCurrency(incomeExpenseAnalysis.totalExpenses)}</div>
          </StatsCard>
          
          <StatsCard>
            <div className="label">Average Daily Spending</div>
            <div className="amount negative">
              {burnRateAnalysis ? formatCurrency(burnRateAnalysis.dailyBurnRate) : formatCurrency(0)}
            </div>
          </StatsCard>
          
          <StatsCard>
            <div className="label">Monthly Burn Rate</div>
            <div className="amount negative">
              {burnRateAnalysis ? formatCurrency(burnRateAnalysis.monthlyBurnRate) : formatCurrency(0)}
            </div>
          </StatsCard>
          
          <StatsCard>
            <div className="label">Spending Trend</div>
            <div className="amount neutral">
              {burnRateAnalysis ? (
                <>
                  {burnRateAnalysis.burnRateTrend === 'increasing' ? '📈' : 
                   burnRateAnalysis.burnRateTrend === 'decreasing' ? '📉' : '➡️'} {' '}
                  {burnRateAnalysis.burnRateTrend.charAt(0).toUpperCase() + burnRateAnalysis.burnRateTrend.slice(1)}
                </>
              ) : '➡️ Stable'}
            </div>
          </StatsCard>
        </Grid>
      )}

      {/* Charts Grid */}
      <Grid columns={2} gap="20px">
        {/* Spending by Category Chart */}
        <ChartCard>
          <h3>Spending by Category</h3>
          <div className="chart-container">
            {filteredSpendingByCategory.length > 0 ? (
              <Doughnut 
                key={`category-chart-${filteredSpendingByCategory.length}`}
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
                          const total = filteredSpendingByCategory.reduce((sum, cat) => sum + cat.amount, 0);
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

        {/* Monthly Spending Trend */}
        <ChartCard>
          <h3>Monthly Spending Trend</h3>
          <div className="chart-container">
            {monthlyTrends.length > 0 ? (
              <Bar 
                key={`spending-trend-chart-${monthlyTrends.length}`}
                data={spendingTrendData}
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
                          return `Spending: ${formatCurrency(context.parsed.y)}`;
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
                No spending trend data available.
              </div>
            )}
          </div>
        </ChartCard>
      </Grid>

      {/* Category Breakdown */}
      {filteredSpendingByCategory.length > 0 && (
        <Card>
          <h3>Category Breakdown (Click for Details)</h3>
          <CategoryTable>
            {filteredSpendingByCategory.map((category, index) => (
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
          includeTransfers={selectedSpendingTypes.includes('transfer')}
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
    </SpendingContainer>
  );
};

export default SpendingReports;