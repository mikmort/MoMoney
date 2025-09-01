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
  subcategory?: string;
  account: string;
  transactions: Transaction[];
  isActive: boolean;
  monthsSinceLastCharge: number;
  brandLogo?: string;
  priceChange?: {
    hasChanged: boolean;
    oldAmount?: number;
    newAmount?: number;
    changePercent?: number;
    changeDate?: Date;
  };
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
  // Brand logos for well-known subscription services
  private readonly BRAND_LOGOS = {
    'netflix': '🎬',
    'spotify': '🎵', 
    'apple music': '🎵',
    'youtube': '📺',
    'youtube premium': '📺',
    'hulu': '📺',
    'disney': '🏰',
    'disney+': '🏰',
    'hbo': '📺',
    'hbo max': '📺',
    'amazon prime': '📦',
    'adobe': '🎨',
    'microsoft': '💼',
    'office 365': '💼',
    'dropbox': '☁️',
    'google': '🔍',
    'gmail': '📧',
    'zoom': '📹',
    'slack': '💬',
    'github': '👨‍💻',
    'linkedin': '💼',
    'twitter': '🐦',
    'instagram': '📸',
    'facebook': '👥',
    'whatsapp': '💬',
    'telegram': '💬',
    'uber': '🚗',
    'lyft': '🚗',
    'doordash': '🍔',
    'ubereats': '🍔',
    'grubhub': '🍔',
    'instacart': '🛒',
    'peloton': '🚴‍♂️',
    'gym': '💪',
    'fitness': '💪',
    'planet fitness': '💪',
    'starbucks': '☕',
    'walmart': '🛒',
    'target': '🎯',
    'costco': '🛒',
    'sam\'s club': '🛒'
  };

  // Helper to detect brand and get logo
  private detectBrandLogo(description: string): string | undefined {
    const normalizedDesc = description.toLowerCase();
    
    for (const [brand, logo] of Object.entries(this.BRAND_LOGOS)) {
      if (normalizedDesc.includes(brand)) {
        return logo;
      }
    }
    
    return undefined;
  }

  // Enhanced frequency calculation with strict pattern detection
  private calculateFrequency(transactions: Transaction[]): string {
    if (transactions.length <= 1) return 'One-time';
    
    const sortedTransactions = transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // Calculate intervals between consecutive transactions
    const intervals: number[] = [];
    for (let i = 1; i < sortedTransactions.length; i++) {
      const prevDate = new Date(sortedTransactions[i - 1].date);
      const currDate = new Date(sortedTransactions[i].date);
      const daysDiff = Math.ceil((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
      intervals.push(daysDiff);
    }
    
    // Check for consistent patterns (not just averages)
    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const maxDeviation = Math.max(...intervals.map(interval => Math.abs(interval - avgInterval)));
    
    // Require much stricter consistency for subscription detection
    // Allow max 7 days deviation for monthly, 3 days for weekly, 1 day for bi-weekly
    const tolerances = {
      weekly: { min: 5, max: 10, maxDeviation: 3 },
      biweekly: { min: 12, max: 18, maxDeviation: 4 },  
      monthly: { min: 25, max: 35, maxDeviation: 7 },
      quarterly: { min: 85, max: 100, maxDeviation: 14 }
    };
    
    // Check if pattern matches known subscription frequencies
    if (avgInterval >= tolerances.weekly.min && avgInterval <= tolerances.weekly.max && maxDeviation <= tolerances.weekly.maxDeviation) {
      return 'Weekly';
    }
    if (avgInterval >= tolerances.biweekly.min && avgInterval <= tolerances.biweekly.max && maxDeviation <= tolerances.biweekly.maxDeviation) {
      return 'Bi-weekly';
    }
    if (avgInterval >= tolerances.monthly.min && avgInterval <= tolerances.monthly.max && maxDeviation <= tolerances.monthly.maxDeviation) {
      return 'Monthly';
    }
    if (avgInterval >= tolerances.quarterly.min && avgInterval <= tolerances.quarterly.max && maxDeviation <= tolerances.quarterly.maxDeviation) {
      return 'Quarterly';
    }
    
    // Check for annual patterns (need at least 2 years of data)
    const firstDate = new Date(sortedTransactions[0].date);
    const lastDate = new Date(sortedTransactions[sortedTransactions.length - 1].date);
    const totalDays = Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (totalDays >= 300 && avgInterval >= 350 && avgInterval <= 380 && maxDeviation <= 30) {
      return 'Annual';
    }
    
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
      case 'Annual':
        return absAmount;
      default:
        // For irregular or one-time, don't annualize
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
      case 'Annual':
        nextDate.setFullYear(nextDate.getFullYear() + 1);
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
  async detectSubscriptions(showInactiveOnly: boolean = false): Promise<SubscriptionDetectionResult> {
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
      
      // Analyze each group for subscription characteristics (much stricter now)
      const allSubscriptions: Subscription[] = [];
      
      for (const group of transactionGroups) {
        if (this.isLikelySubscription(group)) {
          const subscription = this.createSubscriptionFromGroup(group);
          allSubscriptions.push(subscription);
        }
      }

      // Filter by active status (show active by default, unless showInactiveOnly is true)
      const filteredSubscriptions = showInactiveOnly 
        ? allSubscriptions.filter(s => !s.isActive)
        : allSubscriptions.filter(s => s.isActive);

      // Sort by annual cost descending
      filteredSubscriptions.sort((a, b) => b.annualCost - a.annualCost);

      // Calculate summary statistics (from filtered subscriptions)
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

  // Method to get both active and inactive subscriptions with counts
  async getAllSubscriptionsWithStatus(): Promise<{
    active: Subscription[];
    inactive: Subscription[];
    totalActive: number;
    totalInactive: number;
    totalAnnualCost: number;
  }> {
    const activeResult = await this.detectSubscriptions(false);
    const inactiveResult = await this.detectSubscriptions(true);
    
    return {
      active: activeResult.subscriptions,
      inactive: inactiveResult.subscriptions,
      totalActive: activeResult.subscriptions.length,
      totalInactive: inactiveResult.subscriptions.length,
      totalAnnualCost: activeResult.totalAnnualCost
    };
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

    // Create amount groups with tolerance for price changes (e.g., Netflix $25.37 vs $27.58)
    const amountGroups = new Map<string, typeof transactionData>();
    
    for (const data of transactionData) {
      let foundGroup = false;
      
      // Check if this amount fits into an existing group (within 30% tolerance)
      for (const [groupKey, existingGroup] of amountGroups) {
        const groupAmount = parseFloat(groupKey);
        const tolerance = Math.max(0.5, groupAmount * 0.3); // Minimum 50 cents or 30% tolerance
        
        if (Math.abs(data.amount - groupAmount) <= tolerance) {
          existingGroup.push(data);
          foundGroup = true;
          break;
        }
      }
      
      // If no similar amount group found, create new one
      if (!foundGroup) {
        const amountKey = data.amount.toString();
        amountGroups.set(amountKey, [data]);
      }
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

      // For transactions with similar amounts, group by description similarity
      for (const data of amountGroup) {
        if (used.has(data.transaction.id)) continue;

        const group = [data.transaction];
        used.add(data.transaction.id);

        // Compare with other transactions in the same amount group
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
    // Must have at least 3 transactions to establish a pattern (more strict)
    if (transactions.length < 3) {
      return false;
    }

    const frequency = this.calculateFrequency(transactions);
    
    // Only consider regular subscription frequencies (exclude irregular patterns)
    const validFrequencies = ['Weekly', 'Bi-weekly', 'Monthly', 'Quarterly', 'Annual'];
    if (!validFrequencies.includes(frequency)) {
      return false;
    }
    
    // Exclude daily purchases (like cafeterias) from being considered subscriptions
    if (this.isDailyPurchasePattern(transactions, frequency)) {
      return false;
    }
    
    // Check for amount consistency - subscriptions should have consistent amounts
    const amounts = transactions.map(t => Math.abs(t.amount));
    const avgAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
    
    // Allow for some price variation (up to 25% for subscription price changes)
    const maxVariation = amounts.reduce((max, amt) => Math.max(max, Math.abs(amt - avgAmount) / avgAmount), 0);
    if (maxVariation > 0.25) {
      return false;
    }
    
    // Exclude very small amounts (likely tips, fees, etc.) unless it's a known brand
    if (avgAmount < 5.0) {
      const brandLogo = this.detectBrandLogo(transactions[0].description);
      if (!brandLogo) {
        return false;
      }
    }
    
    // Exclude very large amounts (likely one-off purchases) unless monthly/quarterly/annual
    if (avgAmount > 500.0 && !['Monthly', 'Quarterly', 'Annual'].includes(frequency)) {
      return false;
    }
    
    // Must span a reasonable time period to establish pattern
    const sortedTransactions = transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const firstDate = new Date(sortedTransactions[0].date);
    const lastDate = new Date(sortedTransactions[sortedTransactions.length - 1].date);
    const daysDiff = Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Require minimum time span based on frequency
    const requiredSpan = {
      'Weekly': 21, // At least 3 weeks
      'Bi-weekly': 42, // At least 6 weeks  
      'Monthly': 70, // At least 2+ months
      'Quarterly': 200, // At least 6+ months
      'Annual': 400 // At least 1+ years
    };
    
    if (daysDiff < (requiredSpan[frequency as keyof typeof requiredSpan] || 30)) {
      return false;
    }

    return true;
  }

  // Helper to detect daily purchase patterns that shouldn't be subscriptions
  private isDailyPurchasePattern(transactions: Transaction[], frequency: string): boolean {
    // If it's weekly or more frequent, check if it's likely a food/dining purchase
    if (frequency === 'Weekly' && transactions.length > 4) {
      // Check if most transactions are in Food & Dining category
      const foodTransactions = transactions.filter(t => 
        t.category === 'Food & Dining' || 
        t.subcategory?.includes('Food') ||
        t.subcategory?.includes('Dining') ||
        t.subcategory?.includes('Coffee') ||
        t.subcategory?.includes('Restaurant') ||
        t.subcategory?.includes('Cafeteria')
      );
      
      const foodRatio = foodTransactions.length / transactions.length;
      
      // If 80% or more are food-related, likely a daily purchase pattern
      if (foodRatio >= 0.8) {
        return true;
      }
    }
    
    // Check for merchants that are commonly daily purchases
    const commonDailyMerchants = ['meyers', 'starbucks', 'dunkin', 'cafe', 'coffee', 'lunch', 'canteen', 'cafeteria'];
    const description = transactions[0]?.description?.toLowerCase() || '';
    
    if (commonDailyMerchants.some(merchant => description.includes(merchant))) {
      // If it's weekly frequency and appears to be food-related, exclude it
      return frequency === 'Weekly';
    }
    
    return false;
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

    // Calculate months since last charge and active status
    const now = new Date();
    const lastChargeDate = new Date(latestTransaction.date);
    const daysSinceLastCharge = Math.floor((now.getTime() - lastChargeDate.getTime()) / (1000 * 60 * 60 * 24));
    const monthsSinceLastCharge = Math.floor(daysSinceLastCharge / 30.44);
    
    // Determine if subscription is active based on frequency and time since last charge
    const isActive = this.isSubscriptionActive(frequency, monthsSinceLastCharge);
    
    // Detect brand logo
    const brandLogo = this.detectBrandLogo(latestTransaction.description);

    // Detect price changes - compare latest transaction with earliest
    const priceChangeInfo = this.detectPriceChange(transactions);

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
      subcategory: latestTransaction.subcategory,
      account: latestTransaction.account,
      transactions: sortedTransactions,
      isActive,
      monthsSinceLastCharge,
      brandLogo,
      // Add price change information
      priceChange: priceChangeInfo
    };
  }

  // Helper to determine if a subscription is still active
  private isSubscriptionActive(frequency: string, monthsSinceLastCharge: number): boolean {
    // Define thresholds for each frequency type
    const activityThresholds = {
      'Weekly': 1, // If no charge in 1+ months, likely inactive
      'Bi-weekly': 1.5, // If no charge in 1.5+ months, likely inactive
      'Monthly': 2, // If no charge in 2+ months, likely inactive  
      'Quarterly': 4, // If no charge in 4+ months, likely inactive
      'Annual': 14 // If no charge in 14+ months, likely inactive
    };
    
    const threshold = activityThresholds[frequency as keyof typeof activityThresholds] || 2;
    return monthsSinceLastCharge < threshold;
  }

  // Helper to detect price changes in subscription
  private detectPriceChange(transactions: Transaction[]): { hasChanged: boolean; oldAmount?: number; newAmount?: number; changePercent?: number; changeDate?: Date } {
    if (transactions.length < 2) {
      return { hasChanged: false };
    }

    const sortedTransactions = transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const amounts = sortedTransactions.map(t => Math.abs(t.amount));
    
    // Look for significant amount changes (more than 5% and at least 50 cents)
    const firstAmount = amounts[0];
    const lastAmount = amounts[amounts.length - 1];
    
    const amountDifference = Math.abs(lastAmount - firstAmount);
    const percentChange = (amountDifference / firstAmount) * 100;
    
    // Consider it a price change if:
    // 1. The difference is more than 5% AND at least 50 cents
    // 2. OR if there's a clear step change in the middle of the transaction history
    if (percentChange > 5 && amountDifference > 0.5) {
      return {
        hasChanged: true,
        oldAmount: firstAmount,
        newAmount: lastAmount,
        changePercent: lastAmount > firstAmount ? percentChange : -percentChange,
        changeDate: sortedTransactions[sortedTransactions.length - 1].date
      };
    }

    // Check for step changes in the middle of the transaction history
    for (let i = 1; i < amounts.length; i++) {
      const prevAmount = amounts[i - 1];
      const currentAmount = amounts[i];
      const stepDifference = Math.abs(currentAmount - prevAmount);
      const stepPercent = (stepDifference / prevAmount) * 100;
      
      if (stepPercent > 5 && stepDifference > 0.5) {
        return {
          hasChanged: true,
          oldAmount: prevAmount,
          newAmount: currentAmount,
          changePercent: currentAmount > prevAmount ? stepPercent : -stepPercent,
          changeDate: sortedTransactions[i].date
        };
      }
    }

    return { hasChanged: false };
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