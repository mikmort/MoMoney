import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Line } from 'react-chartjs-2';
import { Card } from '../../styles/globalStyles';
import { reportsService, CategoryDeepDive, DateRange } from '../../services/reportsService';
import { currencyDisplayService } from '../../services/currencyDisplayService';
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
    font-weight: 600;
    color: #f44336;
  }
`;

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

  // Prepare chart data
  const monthlyTrendData = {
    labels: categoryData.monthlyTrend.map(item => item.month),
    datasets: [
      {
        label: `${categoryName} Spending`,
        data: categoryData.monthlyTrend.map(item => item.amount),
        backgroundColor: 'rgba(244, 67, 54, 0.6)',
        borderColor: 'rgba(244, 67, 54, 1)',
        borderWidth: 2,
        fill: false
      }
    ]
  };

  return (
    <Modal 
      isOpen={true} 
      onClose={onClose} 
      title={`${categoryName} - Category Drilldown`}
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

          {/* Monthly Trend Chart */}
          {categoryData.monthlyTrend.length > 0 && (
            <>
              <h3>Monthly Spending Trend</h3>
              <ChartContainer>
                <Line
                  data={monthlyTrendData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        display: false
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
              </ChartContainer>
            </>
          )}

          {/* All Transactions */}
          {categoryData.recentTransactions.length > 0 && (
            <Card>
              <h3>All Transactions ({categoryData.recentTransactions.length})</h3>
              <TransactionsList>
                {categoryData.recentTransactions.map((transaction, index) => (
                  <div key={index} className="transaction-item">
                    <div className="transaction-info">
                      <div className="description">{transaction.description}</div>
                      <div className="date">{formatDate(transaction.date)}</div>
                    </div>
                    <div className="transaction-amount">
                      {formatCurrency(Math.abs(transaction.amount))}
                    </div>
                  </div>
                ))}
              </TransactionsList>
            </Card>
          )}
    </Modal>
  );
};

export default CategoryDrilldownModal;