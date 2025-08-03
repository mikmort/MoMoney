// Core data models for the Mo Money application

export interface Transaction {
  id: string;
  date: Date;
  amount: number;
  description: string;
  category: string;
  subcategory?: string;
  account: string;
  type: 'income' | 'expense';
  isRecurring?: boolean;
  tags?: string[];
  notes?: string; // User-added notes (main branch)
  additionalNotes?: string; // User-added notes (feature branch compatibility)
  addedDate: Date; // When it was added to the app (feature branch)
  lastModifiedDate: Date; // When the row was last changed (feature branch)
  originalText?: string; // Raw text from statement
  confidence?: number; // AI classification confidence (0-1)
  reasoning?: string; // AI explanation for categorization (feature branch)
  isVerified?: boolean; // User has verified the categorization
  vendor?: string;
  location?: string;
  reimbursed?: boolean; // True if this expense has been reimbursed (main branch)
  reimbursementId?: string; // ID of the matching reimbursement transaction (main branch)
  originalCurrency?: string; // Original currency for foreign transactions (main branch)
  exchangeRate?: number; // Exchange rate if converted from foreign currency (main branch)
}

export interface Account {
  id: string;
  name: string;
  type: 'checking' | 'savings' | 'credit' | 'investment' | 'cash';
  institution: string;
  balance?: number;
  lastSyncDate?: Date;
  isActive: boolean;
}

export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense';
  subcategories: Subcategory[];
  color?: string;
  icon?: string;
  budgetAmount?: number;
  description?: string;
}

export interface Subcategory {
  id: string;
  name: string;
  description?: string;
  keywords?: string[]; // Keywords for AI classification
}

export interface Budget {
  id: string;
  name: string;
  categoryId: string;
  amount: number;
  period: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  startDate: Date;
  endDate?: Date;
  isActive: boolean;
  alertThreshold?: number; // Percentage (0-100) to trigger alerts
}

export interface StatementFile {
  id: string;
  filename: string;
  fileSize: number;
  uploadDate: Date;
  accountId?: string;
  status: 'pending' | 'processing' | 'mapping' | 'importing' | 'completed' | 'error';
  transactionCount?: number;
  processedCount?: number;
  errorMessage?: string;
  fileType: 'pdf' | 'csv' | 'xlsx' | 'ofx';
  schemaMapping?: FileSchemaMapping;
  progress?: number; // 0-100
}

export interface FileSchemaMapping {
  dateColumn?: string;
  descriptionColumn?: string;
  amountColumn?: string;
  categoryColumn?: string;
  subcategoryColumn?: string;
  notesColumn?: string;
  dateFormat?: string;
  amountFormat?: string;
  hasHeaders?: boolean;
  skipRows?: number;
}

export interface FileImportProgress {
  fileId: string;
  status: StatementFile['status'];
  progress: number;
  currentStep: string;
  processedRows: number;
  totalRows: number;
  errors: string[];
}

export interface AIClassificationRequest {
  transactionText: string;
  amount: number;
  date: string;
  availableCategories: Category[];
  availableSubcategories: Subcategory[];
}

export interface AIClassificationResponse {
  category: string;
  subcategory?: string;
  confidence: number;
  reasoning: string;
  suggestedVendor?: string;
  suggestedTags?: string[];
}

export interface AISchemaMappingRequest {
  fileContent: string; // Sample content from the file
  fileType: 'pdf' | 'csv' | 'xlsx' | 'ofx';
  targetSchema: string[]; // Our expected columns
}

export interface AISchemaMappingResponse {
  mapping: FileSchemaMapping;
  confidence: number;
  reasoning: string;
  suggestions: string[];
}

export interface DashboardStats {
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  transactionCount: number;
  topCategories: Array<{
    categoryId: string;
    categoryName: string;
    amount: number;
    percentage: number;
  }>;
  monthlyTrend: Array<{
    month: string;
    income: number;
    expenses: number;
    net: number;
  }>;
}

export interface ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string | string[];
    borderWidth?: number;
  }>;
}

export interface User {
  id: string;
  displayName: string;
  email: string;
  profilePicture?: string;
  preferences: UserPreferences;
}

export interface UserPreferences {
  currency: string;
  dateFormat: string;
  theme: 'light' | 'dark' | 'auto';
  defaultAccount?: string;
  enableNotifications: boolean;
  budgetAlerts: boolean;
  autoCategorizationEnabled: boolean;
}

export interface ReimbursementMatch {
  id: string;
  expenseTransactionId: string;
  reimbursementTransactionId: string;
  confidence: number; // AI confidence in the match (0-1)
  matchType: 'exact' | 'approximate' | 'manual';
  dateDifference: number; // Days between expense and reimbursement
  amountDifference: number; // Difference in amounts (for currency conversion cases)
  reasoning?: string; // AI explanation for the match
  isVerified: boolean; // User has verified the match
}

export interface ReimbursementMatchRequest {
  transactions: Transaction[];
  dateRangeStart?: Date;
  dateRangeEnd?: Date;
  maxDaysDifference?: number; // Maximum days between expense and reimbursement
  tolerancePercentage?: number; // Tolerance for amount differences (e.g., 0.05 = 5%)
}

export interface ReimbursementMatchResponse {
  matches: ReimbursementMatch[];
  unmatched: {
    expenses: Transaction[];
    reimbursements: Transaction[];
  };
  confidence: number;
}

export interface CurrencyExchangeRate {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  date: Date;
  source: string; // API source used
}
