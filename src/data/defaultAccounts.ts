import { Account } from '../types';

export const defaultAccounts: Account[] = [
  {
    id: 'chase-checking',
    name: 'Chase Checking',
    type: 'checking',
    institution: 'JPMorgan Chase Bank',
    isActive: true
  },
  {
    id: 'chase-credit',
    name: 'Chase Credit',
    type: 'credit',
    institution: 'JPMorgan Chase Bank',
    isActive: true
  },
  {
    id: 'savings-primary',
    name: 'Primary Savings',
    type: 'savings',
    institution: 'Bank of America',
    isActive: true
  },
  {
    id: 'amex-platinum',
    name: 'AmEx Platinum',
    type: 'credit',
    institution: 'American Express',
    isActive: true
  },
  {
    id: 'discover-card',
    name: 'Discover Card',
    type: 'credit',
    institution: 'Discover Bank',
    isActive: true
  },
  {
    id: 'cash-wallet',
    name: 'Cash',
    type: 'cash',
    institution: 'Personal',
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
    'chase-checking'
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
  ]
};
