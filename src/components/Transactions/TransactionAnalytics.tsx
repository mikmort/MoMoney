import React, { useMemo } from 'react';
import { currencyDisplayService } from '../../services/currencyDisplayService';
import styled from 'styled-components';
import { Transaction } from '../../types';
import { Card } from '../../styles/globalStyles';

interface TransactionAnalyticsProps {
  transactions: Transaction[];
}

const AnalyticsContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
  margin-bottom: 20px;
`;

const AnalyticsCard = styled(Card)`
  .card-header {
    display: flex;
    align-items: center;
    margin-bottom: 16px;
    
    .icon {
      font-size: 1.5rem;
      margin-right: 12px;
    }
    
    h3 {
      margin: 0;
      color: #333;
    }
  }
  
  .metric {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid #f0f0f0;
    
    &:last-child {
      border-bottom: none;
    }
    
    .label {
      color: #666;
      font-size: 0.9rem;
    }
    
    .value {
      font-weight: 600;
      
      &.positive {
        color: #4caf50;
      }
      
      &.negative {
        color: #f44336;
      }
      
      &.neutral {
        color: #333;
      }
    }
  }
  
  .trend-indicator {
    display: inline-flex;
    align-items: center;
    font-size: 0.8rem;
    margin-left: 8px;
    
    &.up {
      color: #4caf50;
    }
    
    &.down {
      color: #f44336;
    }
    
    &.stable {
      color: #666;
    }
  }
`;

const CategoryBreakdown = styled.div`
  .category-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    
    .category-info {
      .category-name {
        font-weight: 500;
        color: #333;
      }
      
      .transaction-count {
        font-size: 0.8rem;
        color: #666;
      }
    }
    
    .category-amount {
      text-align: right;
      
      .amount {
        font-weight: 600;
        color: #f44336;
      }
      
      .percentage {
        font-size: 0.8rem;
        color: #666;
      }
    }
  }
`;

const TrendChart = styled.div`
  .trend-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
    
    .period {
      font-size: 0.9rem;
      color: #666;
    }
    
    .amount {
      font-weight: 500;
    }
  }
`;

export const TransactionAnalytics: React.FC<TransactionAnalyticsProps> = ({ transactions }) => {
  const analytics = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    
    // Current period (last 30 days)
    const currentPeriod = transactions.filter(t => new Date(t.date) >= thirtyDaysAgo);
    const previousPeriod = transactions.filter(t => 
      new Date(t.date) >= sixtyDaysAgo && new Date(t.date) < thirtyDaysAgo
    );
    
    const currentIncome = currentPeriod
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const currentExpenses = currentPeriod
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    const previousIncome = previousPeriod
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const previousExpenses = previousPeriod
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    // Calculate trends
    const incomeTrend = previousIncome > 0 
      ? ((currentIncome - previousIncome) / previousIncome) * 100 
      : 0;
    
    const expenseTrend = previousExpenses > 0 
      ? ((currentExpenses - previousExpenses) / previousExpenses) * 100 
      : 0;
    
    // Category breakdown
    const categoryTotals = transactions
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => {
        const category = t.category;
        if (!acc[category]) {
          acc[category] = { amount: 0, count: 0 };
        }
        acc[category].amount += Math.abs(t.amount);
        acc[category].count += 1;
        return acc;
      }, {} as Record<string, { amount: number; count: number }>);
    
    const totalExpenses = Object.values(categoryTotals).reduce((sum, cat) => sum + cat.amount, 0);
    
    const topCategories = Object.entries(categoryTotals)
      .map(([category, data]) => ({
        category,
        amount: data.amount,
        count: data.count,
        percentage: totalExpenses > 0 ? (data.amount / totalExpenses) * 100 : 0
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
    
    // Monthly trends (last 6 months)
    const monthlyTrends = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      
      const monthTransactions = transactions.filter(t => {
        const date = new Date(t.date);
        return date >= monthStart && date <= monthEnd;
      });
      
      const income = monthTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);
      
      const expenses = monthTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      
      monthlyTrends.push({
        month: monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        income,
        expenses,
        net: income - expenses
      });
    }
    
    return {
      currentIncome,
      currentExpenses,
      currentNet: currentIncome - currentExpenses,
      incomeTrend,
      expenseTrend,
      topCategories,
      monthlyTrends,
      averageTransaction: transactions.length > 0 
        ? transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0) / transactions.length 
        : 0,
      verificationRate: transactions.length > 0 
        ? (transactions.filter(t => t.isVerified).length / transactions.length) * 100 
        : 0
    };
  }, [transactions]);
  
  const [defaultCurrency, setDefaultCurrency] = React.useState<string>('USD');
  React.useEffect(() => {
    (async () => setDefaultCurrency(await currencyDisplayService.getDefaultCurrency()))();
  }, []);
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: defaultCurrency
    }).format(amount);
  };
  
  const getTrendIndicator = (trend: number) => {
    if (Math.abs(trend) < 1) return { icon: '→', className: 'stable' };
    return trend > 0 
      ? { icon: '↗', className: 'up' } 
      : { icon: '↘', className: 'down' };
  };

  return (
    <AnalyticsContainer>
      {/* Overview Card */}
      <AnalyticsCard>
        <div className="card-header">
          <span className="icon">📊</span>
          <h3>30-Day Overview</h3>
        </div>
        <div className="metric">
          <span className="label">Income</span>
          <div>
            <span className="value positive">{formatCurrency(analytics.currentIncome)}</span>
            {analytics.incomeTrend !== 0 && (
              <span className={`trend-indicator ${getTrendIndicator(analytics.incomeTrend).className}`}>
                {getTrendIndicator(analytics.incomeTrend).icon} {Math.abs(analytics.incomeTrend).toFixed(1)}%
              </span>
            )}
          </div>
        </div>
        <div className="metric">
          <span className="label">Expenses</span>
          <div>
            <span className="value negative">{formatCurrency(analytics.currentExpenses)}</span>
            {analytics.expenseTrend !== 0 && (
              <span className={`trend-indicator ${getTrendIndicator(-analytics.expenseTrend).className}`}>
                {getTrendIndicator(-analytics.expenseTrend).icon} {Math.abs(analytics.expenseTrend).toFixed(1)}%
              </span>
            )}
          </div>
        </div>
        <div className="metric">
          <span className="label">Net</span>
          <span className={`value ${analytics.currentNet >= 0 ? 'positive' : 'negative'}`}>
            {formatCurrency(analytics.currentNet)}
          </span>
        </div>
        <div className="metric">
          <span className="label">Avg Transaction</span>
          <span className="value neutral">{formatCurrency(analytics.averageTransaction)}</span>
        </div>
      </AnalyticsCard>

      {/* Top Categories Card */}
      <AnalyticsCard>
        <div className="card-header">
          <span className="icon">🏷️</span>
          <h3>Top Spending Categories</h3>
        </div>
        <CategoryBreakdown>
          {analytics.topCategories.map((category, index) => (
            <div key={category.category} className="category-item">
              <div className="category-info">
                <div className="category-name">
                  {index + 1}. {category.category}
                </div>
                <div className="transaction-count">
                  {category.count} transactions
                </div>
              </div>
              <div className="category-amount">
                <div className="amount">{formatCurrency(category.amount)}</div>
                <div className="percentage">{category.percentage.toFixed(1)}%</div>
              </div>
            </div>
          ))}
        </CategoryBreakdown>
      </AnalyticsCard>

      {/* Monthly Trends Card */}
      <AnalyticsCard>
        <div className="card-header">
          <span className="icon">📈</span>
          <h3>6-Month Trend</h3>
        </div>
        <TrendChart>
          {analytics.monthlyTrends.map((month, index) => (
            <div key={index} className="trend-item">
              <span className="period">{month.month}</span>
              <span className={`amount ${month.net >= 0 ? 'positive' : 'negative'}`}>
                {formatCurrency(month.net)}
              </span>
            </div>
          ))}
        </TrendChart>
      </AnalyticsCard>

      {/* Data Quality Card */}
      <AnalyticsCard>
        <div className="card-header">
          <span className="icon">✅</span>
          <h3>Data Quality</h3>
        </div>
        <div className="metric">
          <span className="label">Verification Rate</span>
          <span className="value neutral">{analytics.verificationRate.toFixed(1)}%</span>
        </div>
        <div className="metric">
          <span className="label">Total Transactions</span>
          <span className="value neutral">{transactions.length}</span>
        </div>
        <div className="metric">
          <span className="label">With AI Confidence</span>
          <span className="value neutral">
            {transactions.filter(t => t.confidence && t.confidence > 0.9).length}
          </span>
        </div>
        <div className="metric">
          <span className="label">Needs Review</span>
          <span className="value negative">
            {transactions.filter(t => !t.isVerified && (!t.confidence || t.confidence < 0.6)).length}
          </span>
        </div>
      </AnalyticsCard>
    </AnalyticsContainer>
  );
};

export default TransactionAnalytics;
