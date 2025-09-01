import React, { useState, useEffect, useCallback, useMemo } from 'react';
import styled from 'styled-components';
import { Card, Grid } from '../../styles/globalStyles';
import { subscriptionsService, SubscriptionDetectionResult, SubscriptionsFilters } from '../../services/subscriptionsService';
import { DateRange } from '../../services/reportsService';
import { reportsService } from '../../services/reportsService';
import { StatsCard } from '../shared/StatsCard';
import { MultiSelectFilter } from '../shared/MultiSelectFilter';
import { currencyDisplayService } from '../../services/currencyDisplayService';
import { dataService } from '../../services/dataService';
import { Transaction } from '../../types';
import { useCategoriesManager } from '../../hooks/useCategoriesManager';

const SubscriptionsContainer = styled.div`
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

const SubscriptionsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 1rem;
  margin-top: 2rem;
`;

const SubscriptionCard = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  padding: 1.5rem;
  border-left: 4px solid #3498db;

  &:hover {
    box-shadow: 0 4px 8px rgba(0,0,0,0.15);
    transform: translateY(-2px);
    transition: all 0.2s ease;
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
      margin: 0 0 0.25rem 0;
      color: #2c3e50;
      font-size: 1.1rem;
      font-weight: 600;
    }

    .service-description {
      margin: 0;
      color: #7f8c8d;
      font-size: 0.9rem;
    }
  }

  .amount-info {
    text-align: right;

    .current-amount {
      font-size: 1.2rem;
      font-weight: 700;
      color: #e74c3c;
      margin-bottom: 0.25rem;
    }

    .frequency {
      font-size: 0.85rem;
      color: #95a5a6;
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
  }
`;

const SubscriptionDetails = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin-top: 1rem;

  .detail-item {
    .label {
      font-size: 0.8rem;
      color: #7f8c8d;
      margin-bottom: 0.25rem;
      font-weight: 500;
    }

    .value {
      font-weight: 600;
      color: #2c3e50;

      &.annual-cost {
        color: #e67e22;
        font-size: 1.05rem;
      }

      &.next-payment {
        color: #27ae60;
      }
    }
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 3rem 1rem;
  color: #7f8c8d;
  
  .icon {
    font-size: 4rem;
    margin-bottom: 1rem;
  }
  
  h3 {
    margin: 0 0 1rem 0;
    color: #2c3e50;
  }
  
  p {
    max-width: 500px;
    margin: 0 auto;
    line-height: 1.5;
  }
`;

const LoadingState = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 3rem;
  font-size: 1.1rem;
  color: #7f8c8d;
`;

const SubscriptionsReports: React.FC = () => {
  const { categories } = useCategoriesManager();
  
  // Filter states
  const [dateRange, setDateRange] = useState<string>('Last 12 Months');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [selectedFrequencies, setSelectedFrequencies] = useState<string[]>([]);
  
  // Data states
  const [subscriptionData, setSubscriptionData] = useState<SubscriptionDetectionResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [defaultCurrency, setDefaultCurrency] = useState<string>('USD');

  // Load transactions and compute unique accounts
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

  // Get expense categories (subscriptions are typically expenses)
  const expenseCategories = useMemo(() => 
    categories
      .filter(cat => cat.type === 'expense')
      .map(cat => cat.name)
      .sort((a, b) => a.localeCompare(b)), 
    [categories]
  );
  
  const uniqueAccounts = useMemo(() => 
    Array.from(new Set(transactions.map((t: Transaction) => t.account))),
    [transactions]
  );

  // Available frequency options
  const frequencyOptions = ['Weekly', 'Bi-weekly', 'Monthly', 'Quarterly', 'Irregular'];

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

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Get frequency icon
  const getFrequencyIcon = (frequency: string): string => {
    switch (frequency) {
      case 'Weekly': return '📅';
      case 'Bi-weekly': return '📆';
      case 'Monthly': return '🗓️';
      case 'Quarterly': return '📊';
      default: return '⏰';
    }
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

  // Load subscriptions data
  const loadSubscriptionsData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const currentRange = getCurrentDateRange();
      
      // Create comprehensive filters object
      const filters: SubscriptionsFilters = {
        dateRange: currentRange,
        selectedCategories: selectedCategories.length > 0 ? selectedCategories : undefined,
        selectedAccounts: selectedAccounts.length > 0 ? selectedAccounts : undefined,
        selectedFrequencies: selectedFrequencies.length > 0 ? selectedFrequencies : undefined
      };
      
      const data = await subscriptionsService.detectSubscriptionsWithFilters(filters);
      setSubscriptionData(data);
      
    } catch (error) {
      console.error('Error loading subscriptions data:', error);
      setError('Failed to load subscriptions data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [getCurrentDateRange, selectedCategories, selectedAccounts, selectedFrequencies]);

  useEffect(() => {
    loadSubscriptionsData();
  }, [loadSubscriptionsData]);

  if (loading) {
    return (
      <SubscriptionsContainer>
        <LoadingState>
          <div>🔍 Analyzing your transactions for subscriptions...</div>
        </LoadingState>
      </SubscriptionsContainer>
    );
  }

  if (error) {
    return (
      <SubscriptionsContainer>
        <div style={{ color: '#e74c3c', textAlign: 'center', padding: '2rem' }}>
          <h3>Error Loading Subscriptions</h3>
          <p>{error}</p>
        </div>
      </SubscriptionsContainer>
    );
  }

  return (
    <SubscriptionsContainer>
      {/* Filter Controls */}
      <Card>
        <h3>Filters</h3>
        <div className="date-range-selector">
          <div className="filter-group">
            <label>Date Range</label>
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
          </div>

          {dateRange === 'Custom Range' && (
            <>
              <div className="filter-group">
                <label>Start Date</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  placeholder="Start Date"
                />
              </div>
              <div className="filter-group">
                <label>End Date</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  placeholder="End Date"
                />
              </div>
            </>
          )}
          
          <div className="filter-group">
            <label>Categories</label>
            <MultiSelectFilter
              label="Categories"
              options={expenseCategories}
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

          <div className="filter-group">
            <label>Frequencies</label>
            <MultiSelectFilter
              label="Frequencies"
              options={frequencyOptions}
              selectedValues={selectedFrequencies}
              onChange={setSelectedFrequencies}
              placeholder="All Frequencies"
            />
          </div>
        </div>
      </Card>

      {/* Overview Stats */}
      {subscriptionData && (
        <Grid columns={4} gap="20px">
          <StatsCard>
            <div className="label">Total Annual Cost</div>
            <div className="amount negative">{formatCurrency(subscriptionData.totalAnnualCost)}</div>
          </StatsCard>
          
          <StatsCard>
            <div className="label">Active Subscriptions</div>
            <div className="amount">{subscriptionData.subscriptions.length}</div>
          </StatsCard>
          
          <StatsCard>
            <div className="label">Monthly Subscriptions</div>
            <div className="amount">{subscriptionData.monthlySubscriptions}</div>
          </StatsCard>
          
          <StatsCard>
            <div className="label">Other Frequencies</div>
            <div className="amount">
              {subscriptionData.weeklySubscriptions + subscriptionData.quarterlySubscriptions + subscriptionData.otherFrequencySubscriptions}
            </div>
          </StatsCard>
        </Grid>
      )}

      {/* Subscriptions List */}
      {!subscriptionData || subscriptionData.subscriptions.length === 0 ? (
        <EmptyState>
          <div className="icon">📭</div>
          <h3>No Subscriptions Found</h3>
          <p>
            We couldn't find any recurring subscription payments with the current filters. 
            Try adjusting your date range, categories, or accounts to see more results.
          </p>
        </EmptyState>
      ) : (
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
      )}
    </SubscriptionsContainer>
  );
};

export default SubscriptionsReports;