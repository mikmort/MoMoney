import { Transaction, ReimbursementMatch, ReimbursementMatchRequest, ReimbursementMatchResponse } from '../types';
import { currencyExchangeService } from './currencyExchangeService';

export class ReimbursementMatchingService {
  async findReimbursementMatches(request: ReimbursementMatchRequest): Promise<ReimbursementMatchResponse> {
    const { transactions, dateRangeStart, dateRangeEnd, maxDaysDifference = 90, tolerancePercentage = 0.05 } = request;
    
    // Filter transactions within date range
    let filteredTransactions = transactions;
    if (dateRangeStart || dateRangeEnd) {
      filteredTransactions = transactions.filter(t => {
        const transactionDate = new Date(t.date);
        if (dateRangeStart && transactionDate < dateRangeStart) return false;
        if (dateRangeEnd && transactionDate > dateRangeEnd) return false;
        return true;
      });
    }

    // Separate potential reimbursable expenses and reimbursements
    const potentialExpenses = filteredTransactions.filter(t => 
      t.type === 'expense' && 
      !t.reimbursed &&
      this.isReimbursableCategory(t.category)
    );

    const potentialReimbursements = filteredTransactions.filter(t => 
      t.type === 'income' && 
      this.isPotentialReimbursement(t.description)
    );

    const matches: ReimbursementMatch[] = [];
    const matchedExpenseIds = new Set<string>();
    const matchedReimbursementIds = new Set<string>();

    // First pass: Try exact amount matches
    for (const expense of potentialExpenses) {
      for (const reimbursement of potentialReimbursements) {
        if (matchedExpenseIds.has(expense.id) || matchedReimbursementIds.has(reimbursement.id)) {
          continue;
        }

        const daysDifference = this.calculateDaysDifference(expense.date, reimbursement.date);
        if (daysDifference > maxDaysDifference) continue;

        const amountMatch = await this.checkAmountMatch(expense, reimbursement, tolerancePercentage);
        if (amountMatch.isMatch) {
          const match: ReimbursementMatch = {
            id: `${expense.id}-${reimbursement.id}`,
            expenseTransactionId: expense.id,
            reimbursementTransactionId: reimbursement.id,
            confidence: amountMatch.confidence,
            matchType: amountMatch.confidence > 0.95 ? 'exact' : 'approximate',
            dateDifference: daysDifference,
            amountDifference: amountMatch.amountDifference,
            reasoning: amountMatch.reasoning,
            isVerified: false
          };

          matches.push(match);
          matchedExpenseIds.add(expense.id);
          matchedReimbursementIds.add(reimbursement.id);
        }
      }
    }

    // Second pass: Use AI for more complex matching
    const unmatchedExpenses = potentialExpenses.filter(e => !matchedExpenseIds.has(e.id));
    const unmatchedReimbursements = potentialReimbursements.filter(r => !matchedReimbursementIds.has(r.id));

    if (unmatchedExpenses.length > 0 && unmatchedReimbursements.length > 0) {
      const aiMatches = await this.findAIMatches(unmatchedExpenses, unmatchedReimbursements, maxDaysDifference);
      matches.push(...aiMatches);
      
      // Update matched sets
      aiMatches.forEach(match => {
        matchedExpenseIds.add(match.expenseTransactionId);
        matchedReimbursementIds.add(match.reimbursementTransactionId);
      });
    }

    // Calculate overall confidence
    const overallConfidence = matches.length > 0 
      ? matches.reduce((sum, match) => sum + match.confidence, 0) / matches.length
      : 0;

    return {
      matches,
      unmatched: {
        expenses: potentialExpenses.filter(e => !matchedExpenseIds.has(e.id)),
        reimbursements: potentialReimbursements.filter(r => !matchedReimbursementIds.has(r.id))
      },
      confidence: overallConfidence
    };
  }

  private isReimbursableCategory(category: string): boolean {
    const reimbursableCategories = [
      'Healthcare',
      'Transportation', // Work travel
      'Food & Dining', // Business meals
      'Entertainment', // Client entertainment
      'Education', // Professional development
      'Shopping' // Work supplies
    ];
    
    return reimbursableCategories.includes(category);
  }

  private isPotentialReimbursement(description: string): boolean {
    const reimbursementKeywords = [
      'reimbursement', 'reimburse', 'refund', 'hsa', 'fsa', 'hsa deposit',
      'expense reimbursement', 'travel reimbursement', 'medical reimbursement',
      'company reimbursement', 'employer reimbursement', 'payroll', 'expense',
      'flex spending', 'flexible spending', 'health savings'
    ];
    
    const lowerDescription = description.toLowerCase();
    return reimbursementKeywords.some(keyword => lowerDescription.includes(keyword));
  }

  private calculateDaysDifference(date1: Date, date2: Date): number {
    const diffTime = Math.abs(date2.getTime() - date1.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  private async checkAmountMatch(
    expense: Transaction, 
    reimbursement: Transaction, 
    tolerancePercentage: number
  ): Promise<{ isMatch: boolean; confidence: number; amountDifference: number; reasoning: string }> {
    const expenseAmount = Math.abs(expense.amount);
    const reimbursementAmount = Math.abs(reimbursement.amount);
    
    // Check exact match first
    if (expenseAmount === reimbursementAmount) {
      return {
        isMatch: true,
        confidence: 1.0,
        amountDifference: 0,
        reasoning: 'Exact amount match'
      };
    }

    // Check within tolerance
    const difference = Math.abs(expenseAmount - reimbursementAmount);
    const percentageDiff = difference / expenseAmount;
    
    if (percentageDiff <= tolerancePercentage) {
      const confidence = 1 - (percentageDiff / tolerancePercentage) * 0.2; // Max 20% confidence reduction
      return {
        isMatch: true,
        confidence: Math.max(confidence, 0.7),
        amountDifference: difference,
        reasoning: `Amount within ${(percentageDiff * 100).toFixed(1)}% tolerance`
      };
    }

    // Check for potential currency conversion
    if (expense.originalCurrency && expense.originalCurrency !== 'USD') {
      try {
        const converted = await currencyExchangeService.convertAmount(
          expenseAmount, 
          expense.originalCurrency, 
          'USD'
        );
        
        if (converted) {
          const convertedDifference = Math.abs(converted.convertedAmount - reimbursementAmount);
          const convertedPercentageDiff = convertedDifference / converted.convertedAmount;
          
          if (convertedPercentageDiff <= tolerancePercentage) {
            const confidence = 1 - (convertedPercentageDiff / tolerancePercentage) * 0.3; // Max 30% confidence reduction for currency conversion
            return {
              isMatch: true,
              confidence: Math.max(confidence, 0.6),
              amountDifference: convertedDifference,
              reasoning: `Currency converted match (${expense.originalCurrency} to USD at rate ${converted.rate})`
            };
          }
        }
      } catch (error) {
        console.warn('Failed to check currency conversion for reimbursement match:', error);
      }
    }

    return {
      isMatch: false,
      confidence: 0,
      amountDifference: difference,
      reasoning: 'Amount difference too large'
    };
  }

  private async findAIMatches(
    expenses: Transaction[], 
    reimbursements: Transaction[], 
    maxDaysDifference: number
  ): Promise<ReimbursementMatch[]> {
    if (expenses.length === 0 || reimbursements.length === 0) {
      return [];
    }

    try {
      // TODO: Implement AI-powered matching using Azure OpenAI
      // For now, we return empty array but keep the structure for future implementation
      
      // This would involve creating a custom prompt for reimbursement matching
      // and parsing the AI response to identify potential matches
      
      console.log('AI matching not yet implemented for:', {
        expenseCount: expenses.length,
        reimbursementCount: reimbursements.length,
        maxDaysDifference
      });
      
      return [];
      
    } catch (error) {
      console.error('Error in AI reimbursement matching:', error);
      return [];
    }
  }

  async applyReimbursementMatches(transactions: Transaction[], matches: ReimbursementMatch[]): Promise<Transaction[]> {
    const updatedTransactions = [...transactions];
    
    for (const match of matches) {
      const expenseIndex = updatedTransactions.findIndex(t => t.id === match.expenseTransactionId);
      const reimbursementIndex = updatedTransactions.findIndex(t => t.id === match.reimbursementTransactionId);
      
      if (expenseIndex !== -1) {
        updatedTransactions[expenseIndex] = {
          ...updatedTransactions[expenseIndex],
          reimbursed: true,
          reimbursementId: match.reimbursementTransactionId
        };
      }
      
      if (reimbursementIndex !== -1) {
        updatedTransactions[reimbursementIndex] = {
          ...updatedTransactions[reimbursementIndex],
          tags: [...(updatedTransactions[reimbursementIndex].tags || []), 'reimbursement']
        };
      }
    }
    
    return updatedTransactions;
  }

  // Filter out reimbursed expenses from spending calculations
  filterNonReimbursedTransactions(transactions: Transaction[]): Transaction[] {
    return transactions.filter(t => {
      // Keep all income transactions
      if (t.type === 'income') return true;
      
      // For expenses, only keep non-reimbursed ones
      return !t.reimbursed;
    });
  }
}

// Export singleton instance
export const reimbursementMatchingService = new ReimbursementMatchingService();
