import { Transaction } from '../types';
import { dataService } from './dataService';
import { currencyDisplayService } from './currencyDisplayService';

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

  // Helper to normalize merchant/service name from transaction description
  private normalizeServiceName(description: string): string {
    // Remove common prefixes and suffixes
    let normalized = description
      .replace(/^(RECURRING\s+|AUTO\s+|AUTOMATIC\s+)/i, '')
      .replace(/\s+(RECURRING|AUTO|AUTOMATIC)$/i, '')
      .replace(/\s+(PAYMENT|PAY|BILL|SUBSCRIPTION|SUB)$/i, '')
      .replace(/^(PAYMENT\s+TO\s+|PAY\s+)/i, '')
      .trim();

    // Remove transaction IDs and reference numbers
    normalized = normalized.replace(/\s+[A-Z0-9]{6,}/g, '');
    normalized = normalized.replace(/\s+\d{6,}/g, '');
    
    // Remove dates
    normalized = normalized.replace(/\s+\d{1,2}\/\d{1,2}\/\d{2,4}/g, '');
    
    return normalized.trim();
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
      
      // Convert to common currency
      const convertedTransactions = await currencyDisplayService.convertTransactionsBatch(allTransactions);
      
      // Filter for expense transactions only (subscriptions are typically expenses)
      const expenseTransactions = convertedTransactions.filter(t => 
        t.type === 'expense' && 
        t.amount < 0 && // Expense transactions have negative amounts
        !this.isInternalTransfer(t)
      );

      // Group similar transactions
      const transactionGroups = this.groupSimilarTransactions(expenseTransactions);
      
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

  // Helper to group similar transactions
  private groupSimilarTransactions(transactions: Transaction[]): Transaction[][] {
    const groups: Transaction[][] = [];
    const used = new Set<string>();

    for (const transaction of transactions) {
      if (used.has(transaction.id)) continue;

      const group = [transaction];
      used.add(transaction.id);

      // Find similar transactions
      for (const otherTransaction of transactions) {
        if (used.has(otherTransaction.id)) continue;
        if (this.areTransactionsSimilar(transaction, otherTransaction)) {
          group.push(otherTransaction);
          used.add(otherTransaction.id);
        }
      }

      groups.push(group);
    }

    return groups;
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
}

// Export singleton instance
export const subscriptionsService = new SubscriptionsService();