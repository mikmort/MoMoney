import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { subscriptionsService, SubscriptionDetectionResult } from '../../services/subscriptionsService';
import { currencyDisplayService } from '../../services/currencyDisplayService';

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
`;

const Header = styled.div`
  margin-bottom: 2rem;
  
  h1 {
    margin: 0 0 0.5rem 0;
    color: #2c3e50;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    
    .icon {
      font-size: 2rem;
    }
  }
  
  p {
    color: #7f8c8d;
    margin: 0;
  }
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
`;

const StatCard = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  padding: 1.5rem;
  
  .stat-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    
    .icon {
      font-size: 1.5rem;
    }
    
    h3 {
      margin: 0;
      color: #2c3e50;
      font-size: 0.9rem;
      text-transform: uppercase;
      font-weight: 600;
    }
  }
  
  .stat-value {
    font-size: 2rem;
    font-weight: bold;
    color: #3498db;
    margin: 0;
  }
  
  .stat-description {
    font-size: 0.85rem;
    color: #7f8c8d;
    margin-top: 0.25rem;
  }
`;

const SubscriptionsGrid = styled.div`
  display: grid;
  gap: 1rem;
`;

const SubscriptionCard = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  padding: 1.5rem;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }
`;

const SubscriptionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
  
  .service-info {
    flex: 1;
    
    .service-name {
      font-size: 1.25rem;
      font-weight: bold;
      color: #2c3e50;
      margin: 0 0 0.25rem 0;
    }
    
    .service-description {
      font-size: 0.9rem;
      color: #7f8c8d;
      margin: 0;
    }
  }
  
  .amount-info {
    text-align: right;
    
    .current-amount {
      font-size: 1.5rem;
      font-weight: bold;
      color: #e74c3c;
      margin: 0;
    }
    
    .frequency {
      font-size: 0.85rem;
      color: #7f8c8d;
      margin: 0.25rem 0 0 0;
      text-transform: capitalize;
    }
  }
`;

const SubscriptionDetails = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #ecf0f1;
  
  .detail-item {
    .label {
      font-size: 0.8rem;
      color: #95a5a6;
      text-transform: uppercase;
      font-weight: 600;
      margin-bottom: 0.25rem;
    }
    
    .value {
      font-weight: bold;
      color: #2c3e50;
      
      &.annual-cost {
        color: #e67e22;
        font-size: 1.1rem;
      }
      
      &.next-payment {
        color: #27ae60;
      }
    }
  }
`;

const LoadingState = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 3rem;
  color: #7f8c8d;
  font-size: 1.1rem;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 3rem;
  color: #7f8c8d;
  
  .icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }
  
  h3 {
    margin: 0 0 0.5rem 0;
    color: #2c3e50;
  }
  
  p {
    margin: 0;
    max-width: 400px;
    margin: 0 auto;
    line-height: 1.6;
  }
`;

const ErrorState = styled.div`
  text-align: center;
  padding: 3rem;
  color: #e74c3c;
  
  .icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }
  
  h3 {
    margin: 0 0 0.5rem 0;
  }
  
  p {
    margin: 0;
    color: #7f8c8d;
  }
`;

const Subscriptions: React.FC = () => {
  const [subscriptionData, setSubscriptionData] = useState<SubscriptionDetectionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => {
    const loadSubscriptions = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await subscriptionsService.detectSubscriptions();
        setSubscriptionData(result);
      } catch (err) {
        console.error('Error loading subscriptions:', err);
        setError('Failed to load subscription data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadSubscriptions();
  }, []);

  const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(date);
  };

  const getFrequencyIcon = (frequency: string): string => {
    switch (frequency) {
      case 'Weekly': return '📅';
      case 'Bi-weekly': return '📆';
      case 'Monthly': return '🗓️';
      case 'Quarterly': return '📊';
      default: return '⏰';
    }
  };

  if (loading) {
    return (
      <Container>
        <LoadingState>
          <div>🔍 Analyzing your transactions for subscriptions...</div>
        </LoadingState>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <ErrorState>
          <div className="icon">⚠️</div>
          <h3>Error Loading Subscriptions</h3>
          <p>{error}</p>
        </ErrorState>
      </Container>
    );
  }

  if (!subscriptionData || subscriptionData.subscriptions.length === 0) {
    return (
      <Container>
        <Header>
          <h1>
            <span className="icon">🔄</span>
            Subscriptions
          </h1>
          <p>Track your recurring subscription payments and their annual costs</p>
        </Header>
        
        <EmptyState>
          <div className="icon">📭</div>
          <h3>No Subscriptions Found</h3>
          <p>
            We couldn't find any recurring subscription payments in your transactions. 
            This could mean you don't have any subscriptions, or they haven't been imported yet. 
            Try importing more transaction data to get better results.
          </p>
        </EmptyState>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <h1>
          <span className="icon">🔄</span>
          Subscriptions
        </h1>
        <p>Track your recurring subscription payments and their annual costs</p>
      </Header>

      <StatsGrid>
        <StatCard>
          <div className="stat-header">
            <span className="icon">💰</span>
            <h3>Total Annual Cost</h3>
          </div>
          <div className="stat-value">{formatCurrency(subscriptionData.totalAnnualCost)}</div>
          <div className="stat-description">
            Estimated yearly spending on subscriptions
          </div>
        </StatCard>

        <StatCard>
          <div className="stat-header">
            <span className="icon">🔄</span>
            <h3>Active Subscriptions</h3>
          </div>
          <div className="stat-value">{subscriptionData.subscriptions.length}</div>
          <div className="stat-description">
            Detected recurring payments
          </div>
        </StatCard>

        <StatCard>
          <div className="stat-header">
            <span className="icon">📅</span>
            <h3>Monthly Subscriptions</h3>
          </div>
          <div className="stat-value">{subscriptionData.monthlySubscriptions}</div>
          <div className="stat-description">
            Billed every month
          </div>
        </StatCard>

        <StatCard>
          <div className="stat-header">
            <span className="icon">📊</span>
            <h3>Other Frequencies</h3>
          </div>
          <div className="stat-value">
            {subscriptionData.weeklySubscriptions + subscriptionData.quarterlySubscriptions + subscriptionData.otherFrequencySubscriptions}
          </div>
          <div className="stat-description">
            Weekly, quarterly, and other billing cycles
          </div>
        </StatCard>
      </StatsGrid>

      <SubscriptionsGrid>
        {subscriptionData.subscriptions.map((subscription) => (
          <SubscriptionCard key={subscription.id}>
            <SubscriptionHeader>
              <div className="service-info">
                <h3 className="service-name">{subscription.name}</h3>
                <p className="service-description">{subscription.category}</p>
              </div>
              <div className="amount-info">
                <div className="current-amount">
                  -{formatCurrency(subscription.amount)}
                </div>
                <div className="frequency">
                  {getFrequencyIcon(subscription.frequency)} {subscription.frequency}
                </div>
              </div>
            </SubscriptionHeader>

            <SubscriptionDetails>
              <div className="detail-item">
                <div className="label">Annual Cost</div>
                <div className="value annual-cost">
                  {formatCurrency(subscription.annualCost)}
                </div>
              </div>

              <div className="detail-item">
                <div className="label">Last Charged</div>
                <div className="value">
                  {formatDate(subscription.lastChargedDate)}
                </div>
              </div>

              {subscription.nextEstimatedDate && (
                <div className="detail-item">
                  <div className="label">Next Payment</div>
                  <div className="value next-payment">
                    {formatDate(subscription.nextEstimatedDate)}
                  </div>
                </div>
              )}

              <div className="detail-item">
                <div className="label">Transactions</div>
                <div className="value">
                  {subscription.transactionCount} payments
                </div>
              </div>

              <div className="detail-item">
                <div className="label">Account</div>
                <div className="value">
                  {subscription.account}
                </div>
              </div>
            </SubscriptionDetails>
          </SubscriptionCard>
        ))}
      </SubscriptionsGrid>
    </Container>
  );
};

export default Subscriptions;