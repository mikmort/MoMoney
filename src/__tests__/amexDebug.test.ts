/**
 * Debug test for AmEx CSV format detection
 */
import { fileProcessingService } from '../services/fileProcessingService';
import { dataService } from '../services/dataService';

describe('AmEx Debug', () => {
  beforeEach(async () => {
    await dataService.clearAllData();
    (dataService as any).isInitialized = true;
  });

  it('should debug AmEx amount reversal detection', async () => {
    // Create a credit card account for testing
    const { accountManagementService } = await import('../services/accountManagementService');
    const creditCardAccount = accountManagementService.addAccount({
      name: 'AmEx Platinum',
      type: 'credit',
      institution: 'American Express',
      currency: 'USD',
      isActive: true
    });

    // Simplified CSV with just the essential columns to avoid schema mapping issues
    const csvContent = `Date,Description,Amount
8/26/2025,APPLE.COM PURCHASE,2.99
8/26/2025,PEACOCK STREAMING,12.13
8/26/2025,Entertainment Credit,-12.13
8/17/2025,RYANAIR AIRLINE,371.07
8/12/2025,WOLT RESTAURANT,23.03
8/9/2025,APPLE.COM PURCHASE,9.92
8/9/2025,WOLT RESTAURANT,52.93
8/6/2025,AUTOPAY PAYMENT,-3973.74`;

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const file = new File([blob], 'amex_activity.csv', { type: 'text/csv' });

    console.log('🧪 Testing AmEx CSV with simplified data...');
    const result = await fileProcessingService.processUploadedFile(file, creditCardAccount.id);
    
    console.log('📊 Processing results:', {
      transactionCount: result.transactions?.length,
      transactions: result.transactions?.map(t => ({
        description: t.description,
        originalAmount: t.amount,
        type: t.type
      }))
    });

    expect(result.transactions).toBeDefined();
    
    // Check if reversal was applied correctly
    const appleTransaction = result.transactions?.find(t => t.description.includes('APPLE.COM'));
    const paymentTransaction = result.transactions?.find(t => t.description.includes('AUTOPAY PAYMENT'));
    
    console.log('🍎 Apple transaction:', appleTransaction);
    console.log('💰 Payment transaction:', paymentTransaction);
    
    // After reversal: 
    // - APPLE.COM (originally +2.99) should become -2.99 (expense)
    // - AUTOPAY PAYMENT (originally -3973.74) should become +3973.74 (payment/income)
    if (appleTransaction && paymentTransaction) {
      expect(appleTransaction.amount).toBe(-2.99);
      expect(paymentTransaction.amount).toBe(3973.74);
      expect(appleTransaction.type).toBe('expense');
      expect(paymentTransaction.type).toBe('income');
    }
  });
});
