// Test script to add transfer transactions for matching testing
const testTransactions = [
  {
    id: 'test-ach-debit-capital',
    date: new Date('2025-06-16'),
    amount: -2214.87,
    description: 'ACH Debit CAPITAL ONE',
    category: 'Transfer',
    account: 'Bank of America',
    type: 'transfer'
  },
  {
    id: 'test-ach-debit-chase',
    date: new Date('2025-06-16'),
    amount: -316.72,
    description: 'ACH Debit CHASE CREDIT',
    category: 'Transfer', 
    account: 'Bank of America',
    type: 'transfer'
  },
  {
    id: 'test-auto-payment-chase',
    date: new Date('2025-06-13'),
    amount: 316.72,
    description: 'AUTOMATIC PAYMENT - Chase Checking',
    category: 'Transfer',
    account: 'Chase Checking', 
    type: 'transfer'
  },
  {
    id: 'test-capital-transfer',
    date: new Date('2025-06-15'),
    amount: 2214.87,
    description: 'Capital One Transfer',
    category: 'Transfer',
    account: 'Capital One',
    type: 'transfer'
  },
  {
    id: 'test-bank-transfer-out',
    date: new Date('2025-06-14'),
    amount: -500.00,
    description: 'Bank Transfer OUT', 
    category: 'Transfer',
    account: 'Wells Fargo',
    type: 'transfer'
  },
  {
    id: 'test-bank-transfer-in',
    date: new Date('2025-06-14'),
    amount: 500.00,
    description: 'Bank Transfer IN',
    category: 'Transfer',
    account: 'Savings Account',
    type: 'transfer'
  }
];

export default testTransactions;