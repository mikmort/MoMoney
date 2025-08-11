import { chaseConnectivityService } from '../services/chaseConnectivityService';

describe('ChaseConnectivityService', () => {
  describe('detectChaseFormat', () => {
    it('should detect Chase checking account CSV format', () => {
      const csvContent = `Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #
DEBIT CARD PURCHASE,12/15/2024,STARBUCKS STORE #12345,-4.85,DEBIT,1245.32,
ACH CREDIT,12/14/2024,PAYROLL DEPOSIT COMPANY,2500.00,CREDIT,1250.17,
CHECK,12/13/2024,CHECK 1234,,-150.00,CHECK,750.17,1234`;

      const result = chaseConnectivityService.detectChaseFormat(csvContent);
      
      expect(result.isChase).toBe(true);
      expect(result.accountType).toBe('checking');
      expect(result.confidence).toBeGreaterThan(80);
    });

    it('should detect Chase credit card CSV format', () => {
      const csvContent = `Transaction Date,Post Date,Description,Category,Type,Amount
12/15/2024,12/16/2024,AMAZON.COM,Shopping,Sale,-89.99
12/14/2024,12/15/2024,STARBUCKS #12345,Dining,Sale,-4.85
12/13/2024,12/14/2024,PAYMENT - THANK YOU,Payment,Payment,500.00`;

      const result = chaseConnectivityService.detectChaseFormat(csvContent);
      
      expect(result.isChase).toBe(true);
      expect(result.accountType).toBe('credit');
      expect(result.confidence).toBeGreaterThan(80);
    });

    it('should not detect non-Chase CSV format', () => {
      const csvContent = `Date,Payee,Amount,Category
2024-12-15,Starbucks,-4.85,Coffee
2024-12-14,Salary,2500.00,Income`;

      const result = chaseConnectivityService.detectChaseFormat(csvContent);
      
      expect(result.isChase).toBe(false);
      expect(result.confidence).toBeLessThan(50);
    });
  });

  describe('parseChaseCSV', () => {
    it('should parse Chase checking account transactions correctly', () => {
      const csvContent = `Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #
DEBIT CARD PURCHASE,12/15/2024,STARBUCKS STORE #12345,-4.85,DEBIT,1245.32,
ACH CREDIT,12/14/2024,PAYROLL DEPOSIT COMPANY,2500.00,CREDIT,1250.17,
CHECK,12/13/2024,CHECK 1234,-150.00,CHECK,750.17,1234`;

      const result = chaseConnectivityService.parseChaseCSV(csvContent, 'test-account-id');
      
      expect(result.transactions).toHaveLength(3);
      expect(result.accountInfo).toBeDefined();
      expect(result.accountInfo?.institution).toBe('Chase');
      expect(result.accountInfo?.accountType).toBe('checking');
      
      // Check first transaction (Starbucks)
      const starbucksTransaction = result.transactions.find(t => t.description.includes('STARBUCKS'));
      expect(starbucksTransaction).toBeDefined();
      expect(starbucksTransaction?.amount).toBe(4.85);
      expect(starbucksTransaction?.type).toBe('expense');
      expect(starbucksTransaction?.category).toBe('Restaurants');
      expect(starbucksTransaction?.vendor).toContain('STARBUCKS');
      
      // Check payroll transaction
      const payrollTransaction = result.transactions.find(t => t.description.includes('PAYROLL'));
      expect(payrollTransaction).toBeDefined();
      expect(payrollTransaction?.amount).toBe(2500.00);
      expect(payrollTransaction?.type).toBe('income');
      expect(payrollTransaction?.category).toBe('Income');
    });

    it('should parse Chase credit card transactions correctly', () => {
      const csvContent = `Transaction Date,Post Date,Description,Category,Type,Amount
12/15/2024,12/16/2024,AMAZON.COM,Shopping,Sale,-89.99
12/14/2024,12/15/2024,STARBUCKS #12345,Dining,Sale,-4.85
12/13/2024,12/14/2024,PAYMENT - THANK YOU,Payment,Payment,500.00`;

      const result = chaseConnectivityService.parseChaseCSV(csvContent, 'test-credit-account');
      
      expect(result.transactions).toHaveLength(3);
      expect(result.accountInfo).toBeDefined();
      expect(result.accountInfo?.accountType).toBe('credit');
      
      // Check Amazon transaction
      const amazonTransaction = result.transactions.find(t => t.description.includes('AMAZON'));
      expect(amazonTransaction).toBeDefined();
      expect(amazonTransaction?.amount).toBe(89.99);
      expect(amazonTransaction?.type).toBe('expense');
      expect(amazonTransaction?.category).toBe('Shopping');
      
      // Check payment transaction
      const paymentTransaction = result.transactions.find(t => t.description.includes('PAYMENT'));
      expect(paymentTransaction).toBeDefined();
      expect(paymentTransaction?.amount).toBe(500.00);
      expect(paymentTransaction?.type).toBe('transfer');
    });

    it('should handle empty CSV gracefully', () => {
      const csvContent = `Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #`;

      const result = chaseConnectivityService.parseChaseCSV(csvContent, 'test-account-id');
      
      expect(result.transactions).toHaveLength(0);
      expect(result.accountInfo).toBeNull();
    });
  });

  describe('categorizeChaseTransaction', () => {
    it('should categorize common merchants correctly', () => {
      const testCases = [
        { description: 'STARBUCKS STORE #12345', expected: 'Restaurants' },
        { description: 'AMAZON.COM', expected: 'Shopping' },
        { description: 'SHELL GAS STATION', expected: 'Gas & Fuel' },
        { description: 'WALMART SUPERCENTER', expected: 'Groceries' },
        { description: 'CVS PHARMACY', expected: 'Healthcare' },
        { description: 'ACH TRANSFER', expected: 'Transfer' },
        { description: 'PAYROLL DEPOSIT', expected: 'Income' }
      ];

      testCases.forEach(({ description, expected }) => {
        // Using private method via type assertion for testing
        const service = chaseConnectivityService as any;
        const type = description.includes('TRANSFER') ? 'transfer' : 
                    description.includes('PAYROLL') ? 'income' : 'expense';
        const category = service.categorizeChaseTransaction(description, type);
        expect(category).toBe(expected);
      });
    });
  });

  describe('createChaseAccount', () => {
    it('should create a proper Account object from ChaseAccountInfo', () => {
      const accountInfo = {
        accountId: 'test-id',
        accountType: 'checking' as const,
        institution: 'Chase' as const,
        maskedAccountNumber: 'Ending in 1234',
        accountName: 'Chase Checking',
        balance: 1000.00,
        balanceDate: new Date('2024-12-15')
      };

      const account = chaseConnectivityService.createChaseAccount(accountInfo);
      
      expect(account.id).toBe('test-id');
      expect(account.type).toBe('checking');
      expect(account.institution).toBe('Chase');
      expect(account.currency).toBe('USD');
      expect(account.isActive).toBe(true);
      expect(account.maskedAccountNumber).toBe('Ending in 1234');
      expect(account.balance).toBe(1000.00);
    });
  });

  describe('isChaseFile', () => {
    it('should identify Chase files by filename', () => {
      const chaseFilenames = [
        'chase_activity_20241215.csv',
        'Chase_1234_Activity_20241215.csv',
        '1234_activity_2024.csv',
        'my_chase_export.csv'
      ];

      const nonChaseFilenames = [
        'bank_statement.csv',
        'transactions.csv',
        'wells_fargo_export.csv'
      ];

      chaseFilenames.forEach(filename => {
        expect(chaseConnectivityService.isChaseFile(filename)).toBe(true);
      });

      nonChaseFilenames.forEach(filename => {
        expect(chaseConnectivityService.isChaseFile(filename)).toBe(false);
      });
    });
  });

  describe('getDownloadGuide', () => {
    it('should return proper download instructions', () => {
      const guide = chaseConnectivityService.getDownloadGuide();
      
      expect(guide.steps).toHaveLength(5);
      expect(guide.steps[0].title).toContain('Log into Chase');
      expect(guide.steps[4].title).toContain('Upload to Mo Money');
      expect(guide.supportedFormats).toContain('CSV (Comma Delimited)');
      expect(guide.downloadInstructions).toContain('24 months');
    });
  });
});