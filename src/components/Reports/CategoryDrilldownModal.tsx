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
  PointElement,
  LineElement
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Card } from '../../styles/globalStyles';
import { reportsService, CategoryDeepDive, DateRange } from '../../services/reportsService';
import { currencyDisplayService } from '../../services/currencyDisplayService';

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

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 20px;
`;

const ModalContent = styled.div`
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 1000px;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
`;

const ModalHeader = styled.div`
  padding: 20px;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
  
  h2 {
    margin: 0;
    color: #333;
  }
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #666;
  
  &:hover {
    color: #333;
  }
`;

const ModalBody = styled.div`
  padding: 20px;
`;

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
  onClose: () => void;
}

const CategoryDrilldownModal: React.FC<CategoryDrilldownModalProps> = ({
  categoryName,
  dateRange,
  onClose
}) => {
  const [loading, setLoading] = useState(true);
  const [categoryData, setCategoryData] = useState<CategoryDeepDive | null>(null);

  useEffect(() => {
    const loadCategoryData = async () => {
      setLoading(true);
      try {
        const data = await reportsService.getCategoryDeepDive(categoryName, dateRange);
        setCategoryData(data);
      } catch (error) {
        console.error('Failed to load category data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadCategoryData();
  }, [categoryName, dateRange]);

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

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (loading) {
    return (
      <ModalOverlay onClick={handleOverlayClick}>
        <ModalContent>
          <ModalHeader>
            <h2>Loading Category Details...</h2>
            <CloseButton onClick={onClose}>&times;</CloseButton>
          </ModalHeader>
          <ModalBody>
            <div style={{ textAlign: 'center', padding: '40px' }}>
              Loading category analysis...
            </div>
          </ModalBody>
        </ModalContent>
      </ModalOverlay>
    );
  }

  if (!categoryData) {
    return (
      <ModalOverlay onClick={handleOverlayClick}>
        <ModalContent>
          <ModalHeader>
            <h2>No Data Available</h2>
            <CloseButton onClick={onClose}>&times;</CloseButton>
          </ModalHeader>
          <ModalBody>
            <div style={{ textAlign: 'center', padding: '40px' }}>
              No data found for category "{categoryName}" in the selected date range.
            </div>
          </ModalBody>
        </ModalContent>
      </ModalOverlay>
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
    <ModalOverlay onClick={handleOverlayClick}>
      <ModalContent>
        <ModalHeader>
          <h2>{categoryName} - Category Drilldown</h2>
          <CloseButton onClick={onClose}>&times;</CloseButton>
        </ModalHeader>
        
        <ModalBody>
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

          {/* Recent Transactions */}
          {categoryData.recentTransactions.length > 0 && (
            <Card>
              <h3>Recent Transactions</h3>
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
        </ModalBody>
      </ModalContent>
    </ModalOverlay>
  );
};

export default CategoryDrilldownModal;