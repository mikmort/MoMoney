import { Transaction } from '../types';
import { dataService } from './dataService';
import { currencyDisplayService } from './currencyDisplayService';
import { DateRange } from './reportsService';

export interface SubscriptionsFilters {
  dateRange?: DateRange;
  selectedCategories?: string[];
  selectedAccounts?: string[];
  selectedFrequencies?: string[];
}

export interface Subscription {
  id: string;
  name: string;
  description: string;
  amount: number;
  frequency: string;
  annualCost: number;
  lastChargedDate: Date;
  nextEstimatedDate?: Date;
  transactionCount: number;
  averageAmount: number;
  category: string;
  account: string;
  transactions: Transaction[];
}

export interface SubscriptionDetectionResult {
  subscriptions: Subscription[];
  totalAnnualCost: number;
  monthlySubscriptions: number;
  weeklySubscriptions: number;
  quarterlySubscriptions: number;
  otherFrequencySubscriptions: number;
}

class SubscriptionsService {
  // Helper to calculate frequency of transactions (borrowed from reportsService)
  private calculateFrequency(transactions: Transaction[]): string {
    if (transactions.length <= 1) return 'One-time';
    
    const sortedTransactions = transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const firstDate = new Date(sortedTransactions[0].date);
    const lastDate = new Date(sortedTransactions[sortedTransactions.length - 1].date);
    const daysDiff = Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff === 0) return 'Same day';
    
    const avgDaysBetween = daysDiff / (transactions.length - 1);
    
    if (avgDaysBetween <= 7) return 'Weekly';
    if (avgDaysBetween <= 15) return 'Bi-weekly';  
    if (avgDaysBetween <= 35) return 'Monthly';
    if (avgDaysBetween <= 95) return 'Quarterly';
    
    return 'Irregular';
  }

  // Helper to calculate annual cost based on frequency
  private calculateAnnualCost(amount: number, frequency: string): number {
    const absAmount = Math.abs(amount);
    
    switch (frequency) {
      case 'Weekly':
        return absAmount * 52;
      case 'Bi-weekly':
        return absAmount * 26;
      case 'Monthly':
        return absAmount * 12;
      case 'Quarterly':
        return absAmount * 4;
      default:
        // For irregular or one-time, estimate based on historical data
        return absAmount;
    }
  }

  // Helper to estimate next payment date based on frequency
  private estimateNextPaymentDate(lastDate: Date, frequency: string): Date | undefined {
    const nextDate = new Date(lastDate);
    
    switch (frequency) {
      case 'Weekly':
        nextDate.setDate(nextDate.getDate() + 7);
        break;
      case 'Bi-weekly':
        nextDate.setDate(nextDate.getDate() + 14);
        break;
      case 'Monthly':
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
      case 'Quarterly':
        nextDate.setMonth(nextDate.getMonth() + 3);
        break;
      default:
        return undefined;
    }
    
    return nextDate;
  }

  // Helper to normalize merchant/service name from transaction description (optimized)
  private normalizeServiceName(description: string): string {
    // Use more efficient regex-based approach
    let normalized = description
      .replace(/^(RECURRING\s+|AUTO\s+|AUTOMATIC\s+|PAYMENT\s+TO\s+|PAY\s+)/i, '')
      .replace(/\s+(RECURRING|AUTO|AUTOMATIC|PAYMENT|PAY|BILL|SUBSCRIPTION|SUB)$/i, '')
      .replace(/\s+[A-Z0-9]{6,}|\s+\d{6,}|\s+\d{1,2}\/\d{1,2}\/\d{2,4}/g, '') // Combined regex for IDs and dates
      .trim();
    
    return normalized;
  }

  // Helper to determine if transactions are likely the same subscription
  private areTransactionsSimilar(t1: Transaction, t2: Transaction): boolean {
    // Normalize descriptions for comparison
    const desc1 = this.normalizeServiceName(t1.description).toLowerCase();
    const desc2 = this.normalizeServiceName(t2.description).toLowerCase();
    
    // Check if descriptions are similar (allowing for some variation)
    const similarity = this.calculateStringSimilarity(desc1, desc2);
    const amountMatch = Math.abs(t1.amount - t2.amount) < 0.01; // Allow small rounding differences
    
    return similarity > 0.7 && amountMatch;
  }

  // Helper to calculate string similarity
  private calculateStringSimilarity(s1: string, s2: string): number {
    if (s1 === s2) return 1.0;
    
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  // Helper to calculate Levenshtein distance
  private levenshteinDistance(s1: string, s2: string): number {
    const matrix = [];
    
    for (let i = 0; i <= s2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= s1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= s2.length; i++) {
      for (let j = 1; j <= s1.length; j++) {
        if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[s2.length][s1.length];
  }

  // Main method to detect subscriptions from transactions
  async detectSubscriptions(): Promise<SubscriptionDetectionResult> {
    try {
      // Get all transactions
      const allTransactions = await dataService.getAllTransactions();
      
      // Filter for expense transactions first to reduce processing overhead
      const expenseTransactions = allTransactions.filter(t => 
        t.type === 'expense' && 
        t.amount < 0 && // Expense transactions have negative amounts
        !this.isInternalTransfer(t)
      );

      // Convert only expense transactions to common currency (much smaller dataset)
      const convertedTransactions = await currencyDisplayService.convertTransactionsBatch(expenseTransactions);
      
      // Group similar transactions using optimized algorithm
      const transactionGroups = this.groupSimilarTransactionsOptimized(convertedTransactions);
      
      // Analyze each group for subscription characteristics
      const subscriptions: Subscription[] = [];
      
      for (const group of transactionGroups) {
        if (this.isLikelySubscription(group)) {
          const subscription = this.createSubscriptionFromGroup(group);
          subscriptions.push(subscription);
        }
      }

      // Sort by annual cost descending
      subscriptions.sort((a, b) => b.annualCost - a.annualCost);

      // Calculate summary statistics
      const totalAnnualCost = subscriptions.reduce((sum, sub) => sum + sub.annualCost, 0);
      const monthlySubscriptions = subscriptions.filter(s => s.frequency === 'Monthly').length;
      const weeklySubscriptions = subscriptions.filter(s => s.frequency === 'Weekly').length;
      const quarterlySubscriptions = subscriptions.filter(s => s.frequency === 'Quarterly').length;
      const otherFrequencySubscriptions = subscriptions.length - monthlySubscriptions - weeklySubscriptions - quarterlySubscriptions;

      return {
        subscriptions,
        totalAnnualCost,
        monthlySubscriptions,
        weeklySubscriptions,
        quarterlySubscriptions,
        otherFrequencySubscriptions
      };
      
    } catch (error) {
      console.error('Error detecting subscriptions:', error);
      return {
        subscriptions: [],
        totalAnnualCost: 0,
        monthlySubscriptions: 0,
        weeklySubscriptions: 0,
        quarterlySubscriptions: 0,
        otherFrequencySubscriptions: 0
      };
    }
  }

  // Helper to check if transaction is an internal transfer
  private isInternalTransfer(transaction: Transaction): boolean {
    return transaction.category === 'Internal Transfer';
  }

  // Helper to group similar transactions using optimized approach
  private groupSimilarTransactionsOptimized(transactions: Transaction[]): Transaction[][] {
    const groups: Transaction[][] = [];
    const used = new Set<string>();

    // Pre-compute normalized descriptions and amounts for faster lookup
    const transactionData = transactions.map(t => ({
      transaction: t,
      normalizedDesc: this.normalizeServiceName(t.description).toLowerCase(),
      amount: Math.abs(t.amount)
    }));

    // Create a map for fast amount-based lookups (group by similar amounts first)
    const amountGroups = new Map<string, typeof transactionData>();
    for (const data of transactionData) {
      // Round amount to nearest cent for grouping
      const roundedAmount = Math.round(data.amount * 100) / 100;
      const amountKey = roundedAmount.toString();
      
      if (!amountGroups.has(amountKey)) {
        amountGroups.set(amountKey, []);
      }
      amountGroups.get(amountKey)!.push(data);
    }

    // Process each amount group separately (much smaller subsets)
    for (const [, amountGroup] of amountGroups) {
      if (amountGroup.length === 1) {
        // Single transaction, create its own group
        const data = amountGroup[0];
        if (!used.has(data.transaction.id)) {
          groups.push([data.transaction]);
          used.add(data.transaction.id);
        }
        continue;
      }

      // For transactions with the same amount, group by description similarity
      for (const data of amountGroup) {
        if (used.has(data.transaction.id)) continue;

        const group = [data.transaction];
        used.add(data.transaction.id);

        // Only compare with other transactions in the same amount group
        for (const otherData of amountGroup) {
          if (used.has(otherData.transaction.id)) continue;
          
          // Fast similarity check using simple string contains before expensive Levenshtein
          if (this.areDescriptionsSimilarFast(data.normalizedDesc, otherData.normalizedDesc)) {
            group.push(otherData.transaction);
            used.add(otherData.transaction.id);
          }
        }

        groups.push(group);
      }
    }

    return groups;
  }

  // Fast similarity check using simple string operations before expensive calculations
  private areDescriptionsSimilarFast(desc1: string, desc2: string): boolean {
    if (desc1 === desc2) return true;
    if (desc1.length === 0 || desc2.length === 0) return false;
    
    // If one string is contained in the other, consider them similar
    if (desc1.includes(desc2) || desc2.includes(desc1)) return true;
    
    // Quick word-based similarity check
    const words1 = desc1.split(/\s+/).filter(w => w.length > 2);
    const words2 = desc2.split(/\s+/).filter(w => w.length > 2);
    
    if (words1.length === 0 || words2.length === 0) return false;
    
    // If majority of words match, consider similar
    const commonWords = words1.filter(w1 => words2.some(w2 => w1 === w2 || w1.includes(w2) || w2.includes(w1)));
    const similarity = commonWords.length / Math.max(words1.length, words2.length);
    
    // If fast check shows high similarity, do expensive Levenshtein check only if needed
    if (similarity > 0.5) {
      return this.calculateStringSimilarity(desc1, desc2) > 0.7;
    }
    
    return false;
  }

  // Helper to determine if a group of transactions represents a likely subscription
  private isLikelySubscription(transactions: Transaction[]): boolean {
    if (transactions.length < 2) return false;

    const frequency = this.calculateFrequency(transactions);
    
    // Consider it a subscription if:
    // 1. It's regular (not one-time or irregular)
    // 2. It has at least 2 transactions
    // 3. The amounts are consistent
    const isRegular = ['Weekly', 'Bi-weekly', 'Monthly', 'Quarterly'].includes(frequency);
    const hasMinTransactions = transactions.length >= 2;
    
    // Check amount consistency (allow for small variations)
    const amounts = transactions.map(t => Math.abs(t.amount));
    const avgAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
    const amountVariation = amounts.every(amt => Math.abs(amt - avgAmount) / avgAmount <= 0.1);

    return isRegular && hasMinTransactions && amountVariation;
  }

  // Helper to create a subscription object from a group of transactions
  private createSubscriptionFromGroup(transactions: Transaction[]): Subscription {
    const sortedTransactions = transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const latestTransaction = sortedTransactions[0];
    
    const frequency = this.calculateFrequency(transactions);
    const averageAmount = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0) / transactions.length;
    const annualCost = this.calculateAnnualCost(averageAmount, frequency);
    const normalizedName = this.normalizeServiceName(latestTransaction.description);
    
    const nextEstimatedDate = this.estimateNextPaymentDate(latestTransaction.date, frequency);

    return {
      id: `subscription-${normalizedName.replace(/\s+/g, '-').toLowerCase()}`,
      name: normalizedName || 'Unknown Service',
      description: latestTransaction.description,
      amount: averageAmount,
      frequency,
      annualCost,
      lastChargedDate: latestTransaction.date,
      nextEstimatedDate,
      transactionCount: transactions.length,
      averageAmount,
      category: latestTransaction.category,
      account: latestTransaction.account,
      transactions: sortedTransactions
    };
  }

  // Method to detect subscriptions with filters applied
  async detectSubscriptionsWithFilters(filters?: SubscriptionsFilters): Promise<SubscriptionDetectionResult> {
    try {
      // First get all subscriptions
      const allSubscriptionsResult = await this.detectSubscriptions();
      let filteredSubscriptions = allSubscriptionsResult.subscriptions;

      // Apply filters if provided
      if (filters) {
        // Filter by date range
        if (filters.dateRange) {
          filteredSubscriptions = filteredSubscriptions.filter(subscription => {
            // Check if any transaction in the subscription falls within the date range
            return subscription.transactions.some(transaction => {
              const transactionDate = new Date(transaction.date);
              return transactionDate >= filters.dateRange!.startDate && 
                     transactionDate <= filters.dateRange!.endDate;
            });
          });
        }

        // Filter by categories
        if (filters.selectedCategories && filters.selectedCategories.length > 0) {
          filteredSubscriptions = filteredSubscriptions.filter(subscription =>
            filters.selectedCategories!.includes(subscription.category)
          );
        }

        // Filter by accounts
        if (filters.selectedAccounts && filters.selectedAccounts.length > 0) {
          filteredSubscriptions = filteredSubscriptions.filter(subscription =>
            filters.selectedAccounts!.includes(subscription.account)
          );
        }

        // Filter by frequencies
        if (filters.selectedFrequencies && filters.selectedFrequencies.length > 0) {
          filteredSubscriptions = filteredSubscriptions.filter(subscription =>
            filters.selectedFrequencies!.includes(subscription.frequency)
          );
        }
      }

      // Recalculate summary statistics for filtered results
      const totalAnnualCost = filteredSubscriptions.reduce((sum, sub) => sum + sub.annualCost, 0);
      const monthlySubscriptions = filteredSubscriptions.filter(s => s.frequency === 'Monthly').length;
      const weeklySubscriptions = filteredSubscriptions.filter(s => s.frequency === 'Weekly').length;
      const quarterlySubscriptions = filteredSubscriptions.filter(s => s.frequency === 'Quarterly').length;
      const otherFrequencySubscriptions = filteredSubscriptions.length - monthlySubscriptions - weeklySubscriptions - quarterlySubscriptions;

      return {
        subscriptions: filteredSubscriptions,
        totalAnnualCost,
        monthlySubscriptions,
        weeklySubscriptions,
        quarterlySubscriptions,
        otherFrequencySubscriptions
      };

    } catch (error) {
      console.error('Error detecting filtered subscriptions:', error);
      return {
        subscriptions: [],
        totalAnnualCost: 0,
        monthlySubscriptions: 0,
        weeklySubscriptions: 0,
        quarterlySubscriptions: 0,
        otherFrequencySubscriptions: 0
      };
    }
  }
}

// Export singleton instance
export const subscriptionsService = new SubscriptionsService();