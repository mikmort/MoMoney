import { Account } from '../types';

export const defaultAccounts: Account[] = [
  {
    id: 'chase-checking',
    name: 'Chase Checking',
    type: 'checking',
    institution: 'JPMorgan Chase Bank',
    currency: 'USD',
    isActive: true
  },
  {
    id: 'chase-credit',
    name: 'Chase Credit',
    type: 'credit',
    institution: 'JPMorgan Chase Bank',
    currency: 'USD',
    isActive: true
  },
  {
    id: 'savings-primary',
    name: 'Primary Savings',
    type: 'savings',
    institution: 'Bank of America',
    currency: 'USD',
    isActive: true
  },
  {
    id: 'amex-platinum',
    name: 'AmEx Platinum',
    type: 'credit',
    institution: 'American Express',
    currency: 'USD',
    isActive: true
  },
  {
    id: 'discover-card',
    name: 'Discover Card',
    type: 'credit',
    institution: 'Discover Bank',
    currency: 'USD',
    isActive: true
  },
  {
    id: 'cash-wallet',
    name: 'Cash',
    type: 'cash',
    institution: 'Personal',
    currency: 'USD',
    isActive: true
  },
  {
    id: 'danske-bank-checking',
    name: 'Danske Bank Konto',
    type: 'checking',
    institution: 'Danske Bank',
    currency: 'DKK',
    isActive: true
  },
  // Additional accounts for testing multi-column layout
  {
    id: 'wells-fargo-checking',
    name: 'Wells Fargo Checking',
    type: 'checking',
    institution: 'Wells Fargo Bank',
    currency: 'USD',
    isActive: true
  },
  {
    id: 'capital-one-credit',
    name: 'Capital One Venture',
    type: 'credit',
    institution: 'Capital One',
    currency: 'USD',
    isActive: true
  },
  {
    id: 'citi-credit',
    name: 'Citi Double Cash',
    type: 'credit',
    institution: 'Citibank',
    currency: 'USD',
    isActive: true
  },
  {
    id: 'ally-savings',
    name: 'Ally High Yield Savings',
    type: 'savings',
    institution: 'Ally Bank',
    currency: 'USD',
    isActive: true
  },
  {
    id: 'investment-account',
    name: 'Vanguard Investment',
    type: 'investment',
    institution: 'Vanguard Group',
    currency: 'USD',
    isActive: true
  }
];

// Common patterns for detecting accounts from file names or transaction data
export const accountDetectionPatterns = {
  'chase-checking': [
    'chase checking',
    'chase bank checking',
    'jpmorgan chase checking',
  'chase_checking',
  'chase-checking',
  // Broader filename variants commonly seen in statements
  'chase statement',
  'chase-statement',
  'chase_statement',
  // Generic fallback for Chase when no specific card/account indicated
  'chase'
  ],
  'chase-credit': [
    'chase credit',
    'chase sapphire',
    'chase freedom',
    'chase_credit',
    'chase-credit'
  ],
  'amex-platinum': [
    'american express',
    'amex',
    'platinum card',
    'amex platinum',
    'american_express'
  ],
  'discover-card': [
    'discover',
    'discover card',
    'discover bank',
    'discover_card'
  ],
  'savings-primary': [
    'savings',
    'bank of america savings',
    'boa savings',
    'primary savings'
  ],
  'danske-bank-checking': [
    'danske bank',
    'danske_bank',
    'danske-bank',
    'danish bank',
    'dankort',
    'bankkonto'
  ]
};
