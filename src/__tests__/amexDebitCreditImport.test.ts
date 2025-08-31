/**
 * Test AmEx CSV with positive debits and negative credits
 */
import { fileProcessingService } from '../services/fileProcessingService';
import { dataService } from '../services/dataService';

describe('AmEx CSV Debit/Credit Import', () => {
  beforeEach(async () => {
    await dataService.clearAllData();
    (dataService as any).isInitialized = true;
  });

  it('should handle AmEx format where positive values are debits and negative values are credits', async () => {
    // Sample AmEx-style CSV where positive = debits (expenses), negative = credits (payments/income)
    const csvContent = `Date,Description,Amount
2025-08-01,STARBUCKS STORE,5.50
2025-08-02,AMAZON.COM,25.99
2025-08-03,PAYMENT THANK YOU,-100.00
2025-08-04,SHELL GAS STATION,45.00
2025-08-05,CREDIT BALANCE REFUND,-50.00`;

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const file = new File([blob], 'amex_activity.csv', { type: 'text/csv' });

    const result = await fileProcessingService.processUploadedFile(file, 'test-account');
    
    expect(result.transactions).toBeDefined();
    expect(result.transactions!.length).toBe(5);

    // Verify the amount reversal detection worked correctly
    const starbucks = result.transactions!.find(t => t.description.includes('STARBUCKS'));
    const payment = result.transactions!.find(t => t.description.includes('PAYMENT'));
    const amazon = result.transactions!.find(t => t.description.includes('AMAZON'));
    const credit = result.transactions!.find(t => t.description.includes('CREDIT BALANCE'));

    // After reversal: positive debits should become negative expenses
    expect(starbucks?.amount).toBe(-5.50);  // Was +5.50, should be -5.50 (expense)
    expect(amazon?.amount).toBe(-25.99);    // Was +25.99, should be -25.99 (expense)
    
    // After reversal: negative credits should become positive income  
    expect(payment?.amount).toBe(100.00);   // Was -100.00, should be +100.00 (payment/income)
    expect(credit?.amount).toBe(50.00);     // Was -50.00, should be +50.00 (refund/income)

    // Verify transaction types
    expect(starbucks?.type).toBe('expense');
    expect(amazon?.type).toBe('expense');
    expect(payment?.type).toBe('income');
    expect(credit?.type).toBe('income');
  });

  it('should detect AmEx file pattern correctly', () => {
    const fileService = fileProcessingService as any;
    const patterns = fileService.detectAccountPatterns?.('amex_activity.csv');
    
    expect(patterns).toContain('amex');
  });
});
