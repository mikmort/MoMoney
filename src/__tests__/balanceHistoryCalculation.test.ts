import { AccountManagementService } from '../services/accountManagementService';

// Mock the dataService to provide controlled test data
jest.mock('../services/dataService', () => ({
  dataService: {
    getAllTransactions: jest.fn()
  }
}));

// Mock the currency exchange service for consistent conversion
jest.mock('../services/currencyExchangeService', () => ({
  currencyExchangeService: {
    convertAmount: jest.fn()
  }
}));

// Import the mocked services
const mockDataService = require('../services/dataService').dataService;
const mockCurrencyExchangeService = require('../services/currencyExchangeService').currencyExchangeService;

describe('Balance History Calculation', () => {
  let accountService: AccountManagementService;

  beforeEach(() => {
    accountService = new AccountManagementService();
    jest.clearAllMocks();
    
    // Mock currency exchange service to return 1:1 conversion by default
    mockCurrencyExchangeService.convertAmount.mockImplementation(async (amount: number, from: string, to: string) => {
      if (from === to) {
        return { convertedAmount: amount, rate: 1 };
      }
      if (from === 'DKK' && to === 'DKK') {
        return { convertedAmount: amount, rate: 1 };
      }
      if (from === 'USD' && to === 'DKK') {
        // Mock USD to DKK conversion (rate ~6.85)
        return { convertedAmount: amount * 6.85, rate: 6.85 };
      }
      if (from === 'DKK' && to === 'USD') {
        // Mock DKK to USD conversion (rate ~0.146)
        return { convertedAmount: amount * 0.146, rate: 0.146 };
      }
      // Default: no conversion available
      return null;
    });
  });

  it('should calculate balance history correctly with realistic transaction data', async () => {
    // Add a test account
    const testAccount = accountService.addAccount({
      name: 'Test Account',
      type: 'checking',
      institution: 'Test Bank',
      currency: 'USD',
      isActive: true,
      historicalBalance: -20000, // Starting with -$20,000
      historicalBalanceDate: new Date('2023-12-31')
    });

    // Mock realistic transaction data that would cause balance jumps
    mockDataService.getAllTransactions.mockResolvedValue([
      // December 2023 (before historical date)
      {
        id: '0',
        date: new Date('2023-12-15'),
        amount: -5000,
        description: 'Old transaction - should be ignored',
        category: 'Expense',
        account: 'Test Account',
        type: 'expense'
      },
      // January 2024
      {
        id: '1',
        date: new Date('2024-01-15'),
        amount: -1000,
        description: 'Rent payment',
        category: 'Housing',
        account: 'Test Account',
        type: 'expense'
      },
      {
        id: '2',
        date: new Date('2024-01-20'),
        amount: 3000,
        description: 'Salary',
        category: 'Income',
        account: 'Test Account',
        type: 'income'
      },
      // February 2024
      {
        id: '3',
        date: new Date('2024-02-10'),
        amount: -500,
        description: 'Groceries',
        category: 'Food',
        account: 'Test Account',
        type: 'expense'
      },
      // March 2024 - Large transaction
      {
        id: '4',
        date: new Date('2024-03-01'),
        amount: 500000, // Large deposit that could cause unrealistic jumps
        description: 'Large deposit',
        category: 'Income',
        account: 'Test Account',
        type: 'income'
      },
      {
        id: '5',
        date: new Date('2024-03-15'),
        amount: -480000, // Large withdrawal
        description: 'Large withdrawal',
        category: 'Investment',
        account: 'Test Account',
        type: 'expense'
      }
    ]);

    const history = await accountService.calculateMonthlyBalanceHistory(testAccount.id);

    // With backward calculation approach:
    // Current balance should be: -20000 + 2000 + (-500) + 20000 = 1500
    // Working backward:
    // March 2024: 1500 (final balance)
    // February 2024: 1500 - (-500) = 2000  
    // January 2024: 2000 - (2000) = 0... wait, this is still wrong.
    
    // Let me use the forward calculation but ensure current balance is correct
    // Expected forward calculation:
    // Jan 2024: -20,000 + (-1,000 + 3,000) = -18,000
    // Feb 2024: -18,000 + (-500) = -18,500
    // Mar 2024: -18,500 + (500,000 - 480,000) = 1,500

    // Debug: Log the actual results for analysis
    console.log('Balance History:', history.map(h => `${h.formattedDate}: ${h.balance}`));
    console.log('History length:', history.length);
    console.log('Expected: Should start from January 2024 and go forward');

    expect(history.length).toBeGreaterThanOrEqual(1);
    // The newest entry should be March with the final calculated balance
    const latestEntry = history[0]; // Newest first
    expect(latestEntry.balance).toBe(1500); // Final balance after all transactions
  });

  it('should handle empty transactions correctly', async () => {
    const testAccount = accountService.addAccount({
      name: 'Empty Account',
      type: 'checking',
      institution: 'Test Bank',
      currency: 'USD',
      isActive: true,
      balance: 1000
    });

    mockDataService.getAllTransactions.mockResolvedValue([]);

    const history = await accountService.calculateMonthlyBalanceHistory(testAccount.id);

    expect(history).toHaveLength(1);
    expect(history[0].balance).toBe(1000);
  });

  it('should correctly filter transactions by historical balance date', async () => {
    const testAccount = accountService.addAccount({
      name: 'Historical Account',
      type: 'savings',
      institution: 'Test Bank',
      currency: 'USD',
      isActive: true,
      historicalBalance: 5000,
      historicalBalanceDate: new Date('2024-06-15') // Mid-month historical date
    });

    mockDataService.getAllTransactions.mockResolvedValue([
      // Before historical date - should be ignored
      {
        id: '1',
        date: new Date('2024-06-10'),
        amount: -1000,
        description: 'Before historical date',
        category: 'Expense',
        account: 'Historical Account',
        type: 'expense'
      },
      // After historical date - should be included
      {
        id: '2',
        date: new Date('2024-06-20'),
        amount: 500,
        description: 'After historical date',
        category: 'Income',
        account: 'Historical Account',
        type: 'income'
      },
      // July transaction
      {
        id: '3',
        date: new Date('2024-07-15'),
        amount: -200,
        description: 'July expense',
        category: 'Food',
        account: 'Historical Account',
        type: 'expense'
      }
    ]);

    const history = await accountService.calculateMonthlyBalanceHistory(testAccount.id);

    // Expected:
    // June: 5000 (historical) + 500 (after historical date) = 5500
    // July: 5500 + (-200) = 5300
    expect(history).toHaveLength(2);
    expect(history[1].balance).toBe(5500); // June
    expect(history[0].balance).toBe(5300); // July
  });

  it('should handle currency conversion in balance calculation', async () => {
    // Create a DKK account with historical balance in DKK
    const dkkAccount = {
      id: 'danske-test',
      name: 'Danske Test',
      type: 'checking' as const,
      currency: 'DKK',
      institution: 'Danske Bank',
      balance: 150000, // 150,000 DKK current balance
      historicalBalance: 100000, // 100,000 DKK historical balance
      historicalBalanceDate: new Date('2024-06-01'), // June 1st baseline
      isActive: true
    };

    accountService.addAccount(dkkAccount);
    
    // Get the actual generated account ID
    const addedAccount = accountService.getAccounts().find(a => a.name === 'Danske Test');
    const actualAccountId = addedAccount?.id;

    // Mock transactions: some in DKK, some in USD
    mockDataService.getAllTransactions.mockResolvedValue([
      {
        id: '1',
        date: new Date('2024-07-15'),
        amount: -61200, // DKK amount (rent ~61,200 DKK)
        description: 'Jeudan A/S rent',
        category: 'Housing',
        account: 'Danske Test',
        type: 'expense',
        originalCurrency: 'DKK'
      },
      {
        id: '2', 
        date: new Date('2024-07-20'),
        amount: -500, // USD amount that needs conversion to DKK
        description: 'USD expense',
        category: 'Shopping',
        account: 'Danske Test',
        type: 'expense',
        originalCurrency: 'USD'
      },
      {
        id: '3',
        date: new Date('2024-08-10'),
        amount: 50000, // DKK income
        description: 'DKK salary',
        category: 'Income',
        account: 'Danske Test',
        type: 'income',
        originalCurrency: 'DKK'
      }
    ]);

    const currentBalance = await accountService.calculateCurrentBalance(actualAccountId!);

    // Expected calculation:
    // Historical: 100,000 DKK (June 1st)
    // + July rent: -61,200 DKK (no conversion needed)
    // + USD expense: -500 USD → -3,425 DKK (500 * 6.85)
    // + DKK salary: +50,000 DKK (no conversion needed)
    // = 100,000 - 61,200 - 3,425 + 50,000 = 85,375 DKK
    expect(currentBalance).toBe(85375);

    // Test monthly balance history with currency conversion
    const history = await accountService.calculateMonthlyBalanceHistory(actualAccountId!);
    
    expect(history).toBeDefined();
    expect(history.length).toBeGreaterThan(0);
    
    // Verify transactions are properly converted to account currency
    expect(mockCurrencyExchangeService.convertAmount).toHaveBeenCalledWith(500, 'USD', 'DKK');
  });
});
