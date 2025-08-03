import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  TimeScale
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
import { Card, PageHeader, Grid, Badge } from '../../styles/globalStyles';
import { DashboardStats, Transaction } from '../../types';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  TimeScale
);

const StatsCard = styled(Card)`
  text-align: center;
  
  .amount {
    font-size: 2rem;
    font-weight: 600;
    margin: 8px 0;
    
    &.positive {
      color: #4caf50;
    }
    
    &.negative {
      color: #f44336;
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
`;

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock data - replace with actual API calls
    const mockStats: DashboardStats = {
      totalIncome: 5420.50,
      totalExpenses: 3891.25,
      netIncome: 1529.25,
      transactionCount: 147,
      topCategories: [
        { categoryId: 'housing', categoryName: 'Housing', amount: 1250.00, percentage: 32.1 },
        { categoryId: 'food', categoryName: 'Food & Dining', amount: 456.80, percentage: 11.7 },
        { categoryId: 'transportation', categoryName: 'Transportation', amount: 398.45, percentage: 10.2 },
        { categoryId: 'entertainment', categoryName: 'Entertainment', amount: 267.30, percentage: 6.9 },
        { categoryId: 'shopping', categoryName: 'Shopping', amount: 234.50, percentage: 6.0 }
      ],
      monthlyTrend: [
        { month: 'Jan', income: 5200, expenses: 3800, net: 1400 },
        { month: 'Feb', income: 5150, expenses: 3950, net: 1200 },
        { month: 'Mar', income: 5420, expenses: 3891, net: 1529 },
      ]
    };

    setTimeout(() => {
      setStats(mockStats);
      setRecentTransactions([]);
      setLoading(false);
    }, 1000);
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const categoryChartData = {
    labels: stats?.topCategories.map((cat: any) => cat.categoryName) || [],
    datasets: [
      {
        data: stats?.topCategories.map((cat: any) => cat.amount) || [],
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
    labels: stats?.monthlyTrend.map((month: any) => month.month) || [],
    datasets: [
      {
        label: 'Income',
        data: stats?.monthlyTrend.map((month: any) => month.income) || [],
        backgroundColor: 'rgba(75, 192, 192, 0.6)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 2
      },
      {
        label: 'Expenses',
        data: stats?.monthlyTrend.map((month: any) => month.expenses) || [],
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

  return (
    <div>
      <PageHeader>
        <h1>Dashboard</h1>
        <Badge variant="info">Last updated: {new Date().toLocaleDateString()}</Badge>
      </PageHeader>

      <Grid columns={4} gap="20px">
        <StatsCard>
          <div className="label">Total Income</div>
          <div className="amount positive">{formatCurrency(stats!.totalIncome)}</div>
        </StatsCard>
        
        <StatsCard>
          <div className="label">Total Expenses</div>
          <div className="amount negative">{formatCurrency(stats!.totalExpenses)}</div>
        </StatsCard>
        
        <StatsCard>
          <div className="label">Net Income</div>
          <div className="amount neutral">{formatCurrency(stats!.netIncome)}</div>
        </StatsCard>
        
        <StatsCard>
          <div className="label">Transactions</div>
          <div className="amount neutral">{stats!.transactionCount}</div>
        </StatsCard>
      </Grid>

      <Grid columns={2} gap="20px">
        <ChartCard>
          <h3>Spending by Category</h3>
          <div className="chart-container">
            <Doughnut 
              data={categoryChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'bottom',
                  },
                },
              }}
            />
          </div>
        </ChartCard>

        <ChartCard>
          <h3>Monthly Trend</h3>
          <div className="chart-container">
            <Bar 
              data={trendChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
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
                        return '$' + value.toLocaleString();
                      }
                    }
                  }
                }
              }}
            />
          </div>
        </ChartCard>
      </Grid>

      <RecentTransactions>
        <h3>Recent Transactions</h3>
        {recentTransactions.map((transaction) => (
          <div key={transaction.id} className="transaction-item">
            <div className="transaction-info">
              <div className="description">{transaction.description}</div>
              <div className="details">
                {transaction.category} • {transaction.account} • {transaction.date.toLocaleDateString()}
              </div>
            </div>
            <div className={`amount ${transaction.type}`}>
              {formatCurrency(transaction.amount)}
            </div>
          </div>
        ))}
      </RecentTransactions>
    </div>
  );
};

export default Dashboard;
