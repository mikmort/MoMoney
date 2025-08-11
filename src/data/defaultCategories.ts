import { Category } from '../types';

export const defaultCategories: Category[] = [
  // Income Categories
  {
    id: 'salary',
    name: 'Salary & Wages',
    type: 'income',
    color: '#4CAF50',
    icon: '💼',
    subcategories: [
      { id: 'salary-primary', name: 'Primary Job', description: 'Main employment income' },
      { id: 'salary-secondary', name: 'Secondary Job', description: 'Part-time or second job' },
      { id: 'salary-overtime', name: 'Overtime', description: 'Overtime pay' },
      { id: 'salary-bonus', name: 'Bonus', description: 'Performance bonuses' },
      { id: 'salary-commission', name: 'Commission', description: 'Sales commissions' }
    ]
  },
  {
    id: 'business',
    name: 'Business Income',
    type: 'income',
    color: '#2196F3',
    icon: '🏢',
    subcategories: [
      { id: 'business-revenue', name: 'Revenue', description: 'Business sales revenue' },
      { id: 'business-consulting', name: 'Consulting', description: 'Consulting fees' },
      { id: 'business-freelance', name: 'Freelance', description: 'Freelance work' },
      { id: 'business-royalties', name: 'Royalties', description: 'Intellectual property royalties' },
      { id: 'business-reimbursement', name: 'Expense Reimbursement', description: 'Work expense reimbursements', keywords: ['reimbursement', 'expense', 'travel reimbursement'] }
    ]
  },
  {
    id: 'investments',
    name: 'Investment Income',
    type: 'income',
    color: '#FF9800',
    icon: '📈',
    subcategories: [
      { id: 'investment-dividends', name: 'Dividends', description: 'Stock dividends' },
      { id: 'investment-interest', name: 'Interest', description: 'Savings account interest' },
      { id: 'investment-capital-gains', name: 'Capital Gains', description: 'Investment sales profits' },
      { id: 'investment-rental', name: 'Rental Income', description: 'Property rental income' }
    ]
  },
  {
    id: 'other-income',
    name: 'Other Income',
    type: 'income',
    color: '#9C27B0',
    icon: '💰',
    subcategories: [
      { id: 'other-gifts', name: 'Gifts', description: 'Money gifts received' },
      { id: 'other-refunds', name: 'Refunds', description: 'Tax refunds, returns' },
      { id: 'other-insurance', name: 'Insurance Claims', description: 'Insurance payouts' },
      { id: 'other-misc', name: 'Miscellaneous', description: 'Other income sources' }
    ]
  },

  // Expense Categories
  {
    id: 'housing',
    name: 'Housing',
    type: 'expense',
    color: '#795548',
    icon: '🏠',
    subcategories: [
      { id: 'housing-rent', name: 'Rent/Mortgage', description: 'Monthly rent or mortgage payments', keywords: ['rent', 'mortgage', 'housing'] },
      { id: 'housing-utilities', name: 'Utilities', description: 'Electricity, gas, water', keywords: ['electric', 'gas', 'water', 'utility'] },
      { id: 'housing-internet', name: 'Internet/Phone', description: 'Internet and phone bills', keywords: ['internet', 'phone', 'cable', 'wifi'] },
      { id: 'housing-maintenance', name: 'Maintenance', description: 'Home repairs and maintenance', keywords: ['repair', 'maintenance', 'fix'] },
      { id: 'housing-insurance', name: 'Home Insurance', description: 'Home insurance premiums', keywords: ['home insurance', 'property insurance'] }
    ]
  },
  {
    id: 'transportation',
    name: 'Transportation',
    type: 'expense',
    color: '#607D8B',
    icon: '🚗',
    subcategories: [
      { id: 'transport-fuel', name: 'Fuel/Gas', description: 'Vehicle fuel costs', keywords: ['gas', 'fuel', 'gasoline', 'petrol', 'shell', 'exxon', 'bp'] },
      { id: 'transport-maintenance', name: 'Car Maintenance', description: 'Vehicle repairs and maintenance', keywords: ['car repair', 'oil change', 'tire', 'brake'] },
      { id: 'transport-insurance', name: 'Car Insurance', description: 'Vehicle insurance', keywords: ['car insurance', 'auto insurance'] },
      { id: 'transport-public', name: 'Public Transit', description: 'Bus, train, subway fares', keywords: ['bus', 'train', 'subway', 'metro', 'transit'] },
      { id: 'transport-parking', name: 'Parking', description: 'Parking fees', keywords: ['parking', 'meter'] },
      { id: 'transport-rideshare', name: 'Rideshare/Taxi', description: 'Uber, Lyft, taxi', keywords: ['uber', 'lyft', 'taxi', 'rideshare'] },
      { id: 'transport-business', name: 'Business Travel', description: 'Work-related travel expenses', keywords: ['business travel', 'work travel', 'airline', 'hotel', 'conference'] }
    ]
  },
  {
    id: 'food',
    name: 'Food & Dining',
    type: 'expense',
    color: '#4CAF50',
    icon: '🍽️',
    subcategories: [
      { id: 'food-groceries', name: 'Groceries', description: 'Food shopping', keywords: ['grocery', 'supermarket', 'walmart', 'target', 'kroger', 'safeway'] },
      { id: 'food-restaurants', name: 'Restaurants', description: 'Dining out', keywords: ['restaurant', 'dining', 'mcdonalds', 'starbucks'] },
      { id: 'food-takeout', name: 'Takeout/Delivery', description: 'Food delivery services', keywords: ['doordash', 'uber eats', 'grubhub', 'takeout', 'delivery'] },
      { id: 'food-coffee', name: 'Coffee/Drinks', description: 'Coffee shops and beverages', keywords: ['coffee', 'starbucks', 'cafe', 'drinks'] }
    ]
  },
  {
    id: 'healthcare',
    name: 'Healthcare',
    type: 'expense',
    color: '#F44336',
    icon: '🏥',
    subcategories: [
      { id: 'health-insurance', name: 'Health Insurance', description: 'Health insurance premiums', keywords: ['health insurance', 'medical insurance'] },
      { id: 'health-doctor', name: 'Doctor Visits', description: 'Medical appointments', keywords: ['doctor', 'physician', 'medical'] },
      { id: 'health-pharmacy', name: 'Pharmacy', description: 'Medications and prescriptions', keywords: ['pharmacy', 'cvs', 'walgreens', 'prescription'] },
      { id: 'health-dental', name: 'Dental', description: 'Dental care', keywords: ['dental', 'dentist'] },
      { id: 'health-vision', name: 'Vision', description: 'Eye care and glasses', keywords: ['vision', 'eye', 'glasses', 'optometry'] }
    ]
  },
  {
    id: 'entertainment',
    name: 'Entertainment',
    type: 'expense',
    color: '#E91E63',
    icon: '🎬',
    subcategories: [
      { id: 'entertainment-streaming', name: 'Streaming Services', description: 'Netflix, Spotify, etc.', keywords: ['netflix', 'spotify', 'hulu', 'disney', 'streaming'] },
      { id: 'entertainment-movies', name: 'Movies/Theater', description: 'Cinema and theater', keywords: ['movie', 'cinema', 'theater', 'amc'] },
      { id: 'entertainment-games', name: 'Games', description: 'Video games and gaming', keywords: ['game', 'gaming', 'steam', 'xbox', 'playstation'] },
      { id: 'entertainment-books', name: 'Books/Media', description: 'Books, magazines, media', keywords: ['book', 'magazine', 'amazon', 'kindle'] },
      { id: 'entertainment-hobbies', name: 'Hobbies', description: 'Hobby-related expenses', keywords: ['hobby', 'craft', 'sports'] }
    ]
  },
  {
    id: 'shopping',
    name: 'Shopping',
    type: 'expense',
    color: '#FF5722',
    icon: '🛍️',
    subcategories: [
      { id: 'shopping-clothing', name: 'Clothing', description: 'Clothes and accessories', keywords: ['clothing', 'clothes', 'fashion', 'shoes'] },
      { id: 'shopping-electronics', name: 'Electronics', description: 'Electronics and gadgets', keywords: ['electronics', 'computer', 'phone', 'tech'] },
      { id: 'shopping-home', name: 'Home & Garden', description: 'Home improvement and garden', keywords: ['home depot', 'lowes', 'garden', 'furniture'] },
      { id: 'shopping-personal', name: 'Personal Care', description: 'Personal care items', keywords: ['personal care', 'cosmetics', 'hygiene'] },
      { id: 'shopping-gifts', name: 'Gifts', description: 'Gifts for others', keywords: ['gift', 'present'] }
    ]
  },
  {
    id: 'education',
    name: 'Education',
    type: 'expense',
    color: '#3F51B5',
    icon: '🎓',
    subcategories: [
      { id: 'education-tuition', name: 'Tuition', description: 'School tuition fees', keywords: ['tuition', 'school', 'university', 'college'] },
      { id: 'education-books', name: 'Books/Supplies', description: 'Educational materials', keywords: ['textbook', 'school supplies'] },
      { id: 'education-courses', name: 'Online Courses', description: 'Online learning platforms', keywords: ['course', 'udemy', 'coursera', 'learning'] }
    ]
  },
  {
    id: 'financial',
    name: 'Financial',
    type: 'expense',
    color: '#009688',
    icon: '🏦',
    subcategories: [
      { id: 'financial-fees', name: 'Bank Fees', description: 'Banking and account fees', keywords: ['bank fee', 'atm fee', 'overdraft'] },
      { id: 'financial-interest', name: 'Interest/Finance Charges', description: 'Loan and credit card interest', keywords: ['interest', 'finance charge'] },
      { id: 'financial-investments', name: 'Investments', description: 'Investment contributions', keywords: ['investment', '401k', 'ira', 'stock'] },
      { id: 'financial-insurance', name: 'Insurance', description: 'Other insurance premiums', keywords: ['insurance'] },
      { id: 'financial-taxes', name: 'Taxes', description: 'Tax payments', keywords: ['tax', 'irs'] }
    ]
  },
  {
    id: 'personal',
    name: 'Personal',
    type: 'expense',
    color: '#FF9800',
    icon: '👤',
    subcategories: [
      { id: 'personal-fitness', name: 'Fitness/Gym', description: 'Gym memberships and fitness', keywords: ['gym', 'fitness', 'workout'] },
      { id: 'personal-haircare', name: 'Hair/Beauty', description: 'Hair salons and beauty services', keywords: ['hair', 'salon', 'beauty'] },
      { id: 'personal-subscriptions', name: 'Subscriptions', description: 'Various subscriptions', keywords: ['subscription'] },
      { id: 'personal-charity', name: 'Charity/Donations', description: 'Charitable donations', keywords: ['charity', 'donation'] }
    ]
  },
  {
    id: 'travel',
    name: 'Travel',
    type: 'expense',
    color: '#8E44AD',
    icon: '✈️',
    subcategories: [
      { id: 'travel-hotels', name: 'Hotels', description: 'Hotel and lodging expenses', keywords: ['hotel', 'motel', 'lodging', 'accommodation', 'inn', 'resort', 'marriott', 'hilton', 'airbnb'] },
      { id: 'travel-airfare', name: 'Airfare', description: 'Flight tickets and airline fees', keywords: ['airline', 'flight', 'airfare', 'ticket', 'delta', 'united', 'american airlines', 'southwest', 'jetblue', 'alaska airlines'] },
      { id: 'travel-rental-car', name: 'Rental Car', description: 'Car rental and related fees', keywords: ['rental car', 'car rental', 'hertz', 'enterprise', 'budget', 'avis', 'national', 'alamo'] },
      { id: 'travel-ground-transport', name: 'Ground Transportation', description: 'Local transportation while traveling', keywords: ['taxi', 'uber', 'lyft', 'train', 'bus', 'metro', 'shuttle', 'rideshare'] },
      { id: 'travel-meals', name: 'Travel Meals', description: 'Dining expenses while traveling', keywords: ['meal', 'restaurant', 'dining', 'food', 'travel meal', 'airport food'] },
      { id: 'travel-activities', name: 'Activities & Entertainment', description: 'Tourist activities and entertainment', keywords: ['attraction', 'tour', 'museum', 'activity', 'entertainment', 'sightseeing', 'excursion'] },
      { id: 'travel-parking', name: 'Parking & Tolls', description: 'Parking fees and road tolls during travel', keywords: ['parking', 'toll', 'airport parking', 'garage', 'meter', 'toll road'] },
      { id: 'travel-insurance', name: 'Travel Insurance', description: 'Travel insurance and protection plans', keywords: ['travel insurance', 'trip insurance', 'travel protection'] },
      { id: 'travel-documents', name: 'Travel Documents', description: 'Visas, passports, and travel documents', keywords: ['visa', 'passport', 'travel document', 'embassy', 'consulate'] },
      { id: 'travel-baggage', name: 'Baggage Fees', description: 'Airline baggage and extra fees', keywords: ['baggage', 'luggage', 'checked bag', 'carry on', 'excess baggage'] },
      { id: 'travel-misc', name: 'Miscellaneous', description: 'Other travel-related expenses', keywords: ['travel', 'trip', 'vacation', 'business travel'] }
    ]
  },
  {
    id: 'penalties-fines',
    name: 'Penalties & Fines',
    type: 'expense',
    color: '#A52A2A',
    icon: '⚠️',
    subcategories: [
      { id: 'penalties-parking-tickets', name: 'Parking Tickets', description: 'Parking violations and citations', keywords: ['parking ticket', 'citation', 'meter violation', 'parking violation', 'city parking'] },
      { id: 'penalties-traffic-speeding', name: 'Traffic/Speeding Fines', description: 'Traffic violations and speeding fines', keywords: ['speeding', 'traffic fine', 'moving violation', 'red light', 'camera ticket'] },
      { id: 'penalties-other-government', name: 'Other Government Violations', description: 'Other fines or penalties from government agencies', keywords: ['fine', 'penalty', 'code violation', 'municipal', 'permit'] }
    ]
  },
  {
    id: 'fees-charges',
    name: 'Fees & Charges',
    type: 'expense',
    color: '#8D6E63',
    icon: '💸',
    subcategories: [
      { id: 'fees-bank-fees', name: 'Bank Fees', description: 'Fees charged by banks and credit unions', keywords: ['bank fee', 'service charge', 'maintenance fee', 'atm fee', 'overdraft', 'nsf', 'wire fee'] },
      { id: 'fees-late-fees', name: 'Late Fees (bills, utilities)', description: 'Late payment fees on bills and utilities', keywords: ['late fee', 'late charge', 'past due', 'delinquent', 'penalty fee'] },
      { id: 'fees-service-fees', name: 'Service Fees', description: 'Service or convenience/processing fees', keywords: ['service fee', 'convenience fee', 'processing fee', 'platform fee', 'transaction fee'] }
    ]
  },
  {
    id: 'uncategorized',
    name: 'Uncategorized',
    type: 'expense',
    color: '#9E9E9E',
    icon: '❓',
    subcategories: [
      { id: 'uncategorized-misc', name: 'Miscellaneous', description: 'Uncategorized expenses' },
  { id: 'uncategorized-pending', name: 'Pending Review', description: 'Transactions needing manual review' },
  { id: 'uncategorized-cash-withdrawal', name: 'Cash Withdrawal', description: 'ATM or cash withdrawal expenses', keywords: ['cash withdrawal', 'atm withdrawal', 'atm', 'withdrawal', 'cash'] }
    ]
  },

  // Transfer Category
  {
    id: 'internal-transfer',
    name: 'Internal Transfer',
    type: 'transfer',
    color: '#9C27B0',
    icon: '🔄',
    subcategories: [
      { id: 'transfer-between-accounts', name: 'Between Accounts', description: 'Transfer between your own accounts', keywords: ['transfer', 'move', 'between accounts'] },
      { id: 'transfer-payment', name: 'Payment Transfer', description: 'Payment or fund transfer', keywords: ['payment', 'send', 'pay'] },
      { id: 'transfer-withdrawal', name: 'Withdrawal', description: 'ATM or bank withdrawal', keywords: ['atm', 'withdraw', 'cash'] },
      { id: 'transfer-deposit', name: 'Deposit', description: 'Cash or check deposit', keywords: ['deposit', 'cash', 'check'] }
    ]
  }
];
