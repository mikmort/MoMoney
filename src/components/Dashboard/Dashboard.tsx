import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { Bar, Doughnut } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
import { Card, PageHeader, Grid, Badge } from '../../styles/globalStyles';
import { DashboardStats, Transaction } from '../../types';
import { dashboardService } from '../../services/dashboardService';
import { currencyDisplayService } from '../../services/currencyDisplayService';
import { accountManagementService } from '../../services/accountManagementService';
import { commonBarChartOptions, commonDoughnutOptions } from '../../utils/chartConfig';
import { StatsCard } from '../shared/StatsCard';

const ChartCard = styled(Card)`
  height: 400px;
  
  .chart-container {
    height: 320px;
    position: relative;
  }
  
  h3 {
    margin-bottom: 20px;
    color: #333;
    
    &.clickable-heading {
      cursor: pointer;
      display: inline-block;
      transition: color 0.2s;
      
      &:hover {
        color: #2196f3;
        text-decoration: underline;
      }
    }
  }
`;

const RecentTransactions = styled(Card)`
  .transaction-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid #eee;
    
    &:last-child {
      border-bottom: none;
    }
  }
  
  .transaction-info {
    flex: 1;
    
    .description {
      font-weight: 500;
      margin-bottom: 4px;
    }
    
    .details {
      font-size: 0.85rem;
      color: #666;
    }
  }
  
  .amount {
    font-weight: 600;
    
    &.income {
      color: #4caf50;
    }
    
    &.expense {
      color: #f44336;
    }
  }
  
  .currency-info {
    font-size: 0.75rem;
    color: #888;
    margin-top: 2px;
  }
  
  .clickable-heading {
    cursor: pointer;
    display: inline-block;
    transition: color 0.2s;
    
    &:hover {
      color: #2196f3;
      text-decoration: underline;
    }
  }
  
  .more-link {
    text-align: center;
    padding: 10px 0;
    
    button {
      background: none;
      border: none;
      color: #2196f3;
      cursor: pointer;
      font-size: 0.9rem;
      text-decoration: underline;
      
      &:hover {
        color: #1976d2;
      }
    }
  }
`;

const EmptyStateCard = styled(Card)`
  text-align: center;
  padding: 40px 20px;
  
  .emoji {
    font-size: 3rem;
    margin-bottom: 20px;
    display: block;
  }
  
  h3 {
    margin-bottom: 16px;
    color: #333;
  }
  
  p {
    color: #666;
    margin-bottom: 24px;
    line-height: 1.5;
  }
  
  .action-button {
    background: #2196f3;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
    
    &:hover {
      background: #1976d2;
    }
  }
`;

// Component for displaying transaction amounts with currency conversion
const TransactionAmount: React.FC<{ transaction: Transaction }> = ({ transaction }) => {
  const [displayData, setDisplayData] = useState<{
    displayAmount: string;
    tooltip?: string;
    isConverted: boolean;
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
    <div className={`amount ${transaction.type}`} title={displayData.tooltip}>
      {displayData.displayAmount}
      {displayData.isConverted && displayData.tooltip && (
        <div className="currency-info">
          {transaction.originalCurrency}
        </div>
      )}
    </div>
  );
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasAccounts, setHasAccounts] = useState(false);
  const [hasTransactions, setHasTransactions] = useState(false);
  const [defaultCurrency, setDefaultCurrency] = useState<string>('USD');
  const [formattedStats, setFormattedStats] = useState<{
    totalIncome: string;
    totalExpenses: string;
    netIncome: string;
  }>({
    totalIncome: '$0.00',
    totalExpenses: '$0.00',
    netIncome: '$0.00'
  });

  useEffect(() => {
    const loadDashboardData = async () => {
      setLoading(true);
      try {
        // Check if accounts exist
        const accounts = accountManagementService.getAccounts();
        const accountsExist = accounts.length > 0;
        setHasAccounts(accountsExist);
        
        // Initialize currency display service and get default currency
        await currencyDisplayService.initialize();
        const currency = await currencyDisplayService.getDefaultCurrency();
        setDefaultCurrency(currency);
        
        const [stats, recent] = await Promise.all([
          dashboardService.getDashboardStats(),
          dashboardService.getRecentTransactions(5)
        ]);
        
        // Check if transactions exist
        const transactionsExist = stats.transactionCount > 0;
        setHasTransactions(transactionsExist);
        
        // Format the main stats
        if (stats) {
          const [totalIncomeFormatted, totalExpensesFormatted, netIncomeFormatted] = await Promise.all([
            currencyDisplayService.formatAmount(stats.totalIncome, currency),
            currencyDisplayService.formatAmount(stats.totalExpenses, currency),
            currencyDisplayService.formatAmount(stats.netIncome, currency)
          ]);
          
          setFormattedStats({
            totalIncome: totalIncomeFormatted,
            totalExpenses: totalExpensesFormatted,
            netIncome: netIncomeFormatted
          });
        }
        
        setStats(stats);
        setRecentTransactions(recent);
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  const categoryChartData = {
    labels: stats?.topCategories.map((cat) => cat.categoryName) || [],
    datasets: [
      {
        data: stats?.topCategories.map((cat) => cat.amount) || [],
        backgroundColor: [
          '#FF6384',
          '#36A2EB',
          '#FFCE56',
          '#4BC0C0',
          '#9966FF'
        ],
        borderWidth: 2,
        borderColor: '#fff'
      }
    ]
  };

  const trendChartData = {
    labels: stats?.monthlyTrend.map((month) => month.month) || [],
    datasets: [
      {
        label: 'Income',
        data: stats?.monthlyTrend.map((month) => month.income) || [],
        backgroundColor: 'rgba(75, 192, 192, 0.6)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 2
      },
      {
        label: 'Expenses',
        data: stats?.monthlyTrend.map((month) => month.expenses) || [],
        backgroundColor: 'rgba(255, 99, 132, 0.6)',
        borderColor: 'rgba(255, 99, 132, 1)',
        borderWidth: 2
      }
    ]
  };

  if (loading) {
    return (
      <div>
        <PageHeader>
          <h1>Dashboard</h1>
        </PageHeader>
        <div>Loading...</div>
      </div>
    );
  }

  // No accounts exist - show onboarding to create accounts
  if (!hasAccounts) {
    return (
      <div>
        <PageHeader>
          <h1>Dashboard</h1>
        </PageHeader>
        <EmptyStateCard>
          <span className="emoji">🏦</span>
          <h3>Welcome to Mo Money!</h3>
          <p>
            To get started tracking your finances, you'll need to add at least one bank account.
            <br />
            This will help you organize and categorize your financial data.
          </p>
          <button 
            className="action-button" 
            onClick={() => navigate('/accounts')}
          >
            Add Your First Account
          </button>
        </EmptyStateCard>
      </div>
    );
  }

  // Accounts exist but no transactions - show onboarding to import transactions
  if (hasAccounts && !hasTransactions) {
    return (
      <div>
        <PageHeader>
          <h1>Dashboard</h1>
        </PageHeader>
        <EmptyStateCard>
          <span className="emoji">📊</span>
          <h3>Ready to Import Your Financial Data</h3>
          <p>
            Great! You have accounts set up. Now import your bank statements or manually add transactions
            <br />
            to start seeing your financial insights and trends.
          </p>
          <button 
            className="action-button" 
            onClick={() => navigate('/transactions')}
          >
            Import Transactions
          </button>
        </EmptyStateCard>
      </div>
    );
  }

  return (
    <div>
      <PageHeader>
        <h1>Dashboard</h1>
        <Badge variant="info">Last updated: {new Date().toLocaleDateString()}</Badge>
      </PageHeader>

      <Grid columns={4} gap="20px">
        <StatsCard>
          <div className="label">Total Income</div>
          <div className="amount positive">{formattedStats.totalIncome}</div>
        </StatsCard>
        
        <StatsCard>
          <div className="label">Total Expenses</div>
          <div className="amount negative">{formattedStats.totalExpenses}</div>
        </StatsCard>
        
        <StatsCard>
          <div className="label">Net Income</div>
          <div className="amount neutral">{formattedStats.netIncome}</div>
        </StatsCard>
        
        <StatsCard clickable>
          <div className="label">Transactions</div>
          <div 
            className="amount neutral" 
            onClick={() => navigate('/transactions')}
            title="Click to view all transactions"
          >
            {stats!.transactionCount}
          </div>
        </StatsCard>
      </Grid>

      <Grid columns={2} gap="20px">
        <ChartCard>
          <h3 
            className="clickable-heading"
            onClick={() => navigate('/transactions')}
            title="Click to view all transactions or click chart segments to filter by category"
          >
            Spending by Category
          </h3>
          <div className="chart-container">
            {stats && stats.topCategories.length > 0 ? (
              <Doughnut 
                data={categoryChartData}
                options={{
                  ...commonDoughnutOptions,
                  onClick: (event, elements) => {
                    if (elements.length > 0) {
                      const index = elements[0].index;
                      const categoryName = stats.topCategories[index]?.categoryName;
                      if (categoryName) {
                        navigate(`/transactions?category=${encodeURIComponent(categoryName)}`);
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
                No spending data available.<br />Import transactions to see category breakdown.
              </div>
            )}
          </div>
        </ChartCard>

        <ChartCard>
          <h3>Monthly Trend</h3>
          <div className="chart-container">
            {stats && stats.monthlyTrend.length > 0 ? (
              <Bar 
                data={trendChartData}
                options={{
                  ...commonBarChartOptions,
                  plugins: {
                    legend: {
                      position: 'top',
                    },
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      ticks: {
                        callback: function(value) {
                          const symbol = defaultCurrency === 'EUR' ? '€' : 
                                        defaultCurrency === 'GBP' ? '£' : 
                                        defaultCurrency === 'JPY' ? '¥' : '$';
                          return symbol + Number(value).toLocaleString();
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
                No trend data available.<br />Import transactions from multiple months to see trends.
              </div>
            )}
          </div>
        </ChartCard>
      </Grid>

      <RecentTransactions>
        <h3 
          className="clickable-heading" 
          onClick={() => navigate('/transactions')}
          title="Click to view all transactions"
        >
          Recent Transactions
        </h3>
        {recentTransactions.length > 0 ? (
          <>
            {recentTransactions.map((transaction) => (
              <div key={transaction.id} className="transaction-item">
                <div className="transaction-info">
                  <div className="description">{transaction.description}</div>
                  <div className="details">
                    {transaction.category} • {transaction.account} • {transaction.date.toLocaleDateString()}
                  </div>
                </div>
                <TransactionAmount transaction={transaction} />
              </div>
            ))}
            <div className="more-link">
              <button onClick={() => navigate('/transactions')}>
                More...
              </button>
            </div>
          </>
        ) : (
          <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
            No transactions found. Import your bank statements to see your financial overview.
          </div>
        )}
      </RecentTransactions>
    </div>
  );
};

export default Dashboard;
