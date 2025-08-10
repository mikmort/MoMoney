// Core data models for the Mo Money application

export interface TransactionSplit {
  id: string;
  amount: number;
  category: string;
  subcategory?: string;
  description?: string; // Optional override for split-specific description
  notes?: string;
}

export interface Transaction {
  id: string;
  date: Date;
  amount: number;
  description: string;
  category: string;
  subcategory?: string;
  account: string;
  type: 'income' | 'expense' | 'transfer';
  isRecurring?: boolean;
  tags?: string[];
  notes?: string;
  addedDate?: Date; // When it was added to the app
  lastModifiedDate?: Date; // When the row was last changed
  originalText?: string; // Raw text from statement
  confidence?: number; // AI classification confidence (0-1)
  reasoning?: string; // AI explanation for categorization
  isVerified?: boolean; // User has verified the categorization
  vendor?: string;
  location?: string;
  reimbursed?: boolean; // True if this expense has been reimbursed
  reimbursementId?: string; // ID of the matching reimbursement transaction
  originalCurrency?: string; // Original currency for foreign transactions
  exchangeRate?: number; // Exchange rate if converted from foreign currency
  // Enhanced AI proxy metadata for detailed reasoning transparency
  aiProxyMetadata?: {
    model?: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    finishReason?: string;
    requestId?: string;
    created?: number;
    keyTokens?: string[];
    processingTime?: number;
  };
  // Anomaly detection fields
  isAnomaly?: boolean; // True if amount is unusually high/low vs historical average
  anomalyType?: 'high' | 'low'; // Whether amount is unusually high or low
  anomalyScore?: number; // How many standard deviations from historical average (0-10 scale)
  historicalAverage?: number; // Historical average for this category/vendor
  // Split transaction support
  splits?: TransactionSplit[]; // Optional array of splits for this transaction
  isSplit?: boolean; // Convenience flag to indicate if transaction has splits
  // Transfer matching support
  transferId?: string; // ID of the matched transfer (for linking paired transfers)
  isTransferPrimary?: boolean; // True for the primary row in a collapsed transfer pair
}

export interface Account {
  id: string;
  name: string;
  type: 'checking' | 'savings' | 'credit' | 'investment' | 'cash';
  institution: string;
  currency: string;
  balance?: number;
  lastSyncDate?: Date;
  isActive: boolean;
  // New fields for statement-based account creation
  maskedAccountNumber?: string; // Format: "Ending in XXX"
  historicalBalance?: number; // Balance as of historicalBalanceDate
  historicalBalanceDate?: Date; // Date when the balance was established
}

export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense' | 'transfer';
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
  accountId?: string; // Optional until user selects an account
  status: 'pending' | 'processing' | 'completed' | 'error' | 'awaiting-account-selection' | 'awaiting-duplicate-resolution';
  transactionCount?: number;
  errorMessage?: string;
  fileType: 'pdf' | 'csv' | 'excel' | 'image' | 'ofx' | 'unknown';
  detectedAccountId?: string; // AI-detected account
  accountDetectionConfidence?: number; // Confidence in account detection
  accountDetectionReasoning?: string; // Why this account was suggested
}

export interface FileImportProgress {
  fileId: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number; // 0-100 percentage
  currentStep: string;
  processedRows: number;
  totalRows: number;
  errors: string[];
}

export interface FileSchemaMapping {
  hasHeaders: boolean;
  skipRows: number;
  dateFormat: string;
  amountFormat: string;
  dateColumn?: string;
  descriptionColumn?: string;
  amountColumn?: string;
  categoryColumn?: string;
  subcategoryColumn?: string;
  notesColumn?: string;
}

export interface AISchemaMappingRequest {
  fileContent: string;
  fileType: StatementFile['fileType'];
  targetSchema: string[];
}

export interface AISchemaMappingResponse {
  mapping: FileSchemaMapping;
  confidence: number;
  reasoning: string;
  suggestions: string[];
}

export interface AIClassificationRequest {
  transactionText: string;
  amount: number;
  date: string;
  availableCategories: Category[];
}

export interface AIClassificationResponse {
  categoryId: string;
  subcategoryId?: string;
  confidence: number;
  reasoning?: string;
  suggestedVendor?: string;
  suggestedTags?: string[];
  // Enhanced proxy response metadata for detailed reasoning
  proxyMetadata?: {
    model?: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    finishReason?: string;
    requestId?: string;
    created?: number;
    // Token breakdown for transparency
    keyTokens?: string[];
    processingTime?: number;
  };
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

export interface DuplicateTransaction {
  existingTransaction: Transaction;
  newTransaction: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>;
  matchFields: string[]; // Fields that matched (e.g., ['date', 'amount', 'description', 'account'])
  similarity: number; // Overall similarity score (0-1)
  amountDifference?: number; // Actual amount difference for tolerance matches
  daysDifference?: number; // Days difference for date tolerance matches
  matchType: 'exact' | 'tolerance'; // Type of match found
}

export interface DuplicateDetectionConfig {
  amountTolerance?: number; // Percentage tolerance for amount matching (e.g., 0.05 = 5%)
  fixedAmountTolerance?: number; // Fixed dollar amount tolerance (e.g., 1.00)
  dateTolerance?: number; // Days tolerance for date matching (e.g., 3 days)
  requireExactDescription?: boolean; // Whether description must match exactly
  requireSameAccount?: boolean; // Whether account must match exactly
}

export interface DuplicateDetectionResult {
  duplicates: DuplicateTransaction[];
  uniqueTransactions: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>[];
  config: DuplicateDetectionConfig; // Configuration used for detection
}

// Category mapping rule interfaces
export interface CategoryRule {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  priority: number; // Lower numbers = higher priority
  conditions: RuleCondition[];
  action: RuleAction;
  createdDate: Date;
  lastModifiedDate: Date;
}

export interface RuleCondition {
  field: 'description' | 'amount' | 'account' | 'date';
  operator: 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'greaterThan' | 'lessThan' | 'between' | 'regex';
  value: string | number | Date;
  valueEnd?: string | number | Date; // For 'between' operator
  caseSensitive?: boolean; // For string operations
}

export interface RuleAction {
  categoryId: string;
  categoryName: string;
  subcategoryId?: string;
  subcategoryName?: string;
}

export interface RuleMatchResult {
  matched: boolean;
  rule?: CategoryRule;
  confidence: number;
}

// Anomaly detection interfaces
export interface AnomalyDetectionRequest {
  transactions: Transaction[];
}

export interface AnomalyResult {
  transaction: Transaction;
  anomalyType: 'unusual_amount' | 'unusual_merchant' | 'unusual_category' | 'unusual_frequency' | 'suspicious_pattern';
  severity: 'low' | 'medium' | 'high';
  confidence: number; // 0-1, how confident the AI is that this is an anomaly
  reasoning: string; // AI explanation of why this transaction is anomalous
  historicalContext?: string; // Additional context about historical patterns
}

export interface AnomalyDetectionResponse {
  anomalies: AnomalyResult[];
  totalAnalyzed: number;
  processingTime: number; // in milliseconds
}

// Collapsed Transfer Display Types
export interface CollapsedTransfer {
  id: string;
  date: Date;
  description: string;
  sourceAccount: string;
  targetAccount: string;
  amount: number;
  sourceTransaction: Transaction;
  targetTransaction: Transaction;
  confidence: number;
  matchType: 'exact' | 'approximate' | 'manual';
  amountDifference?: number;
  exchangeRate?: number;
  fees?: Transaction[]; // Associated fee transactions
}

export interface TransferDisplayOptions {
  showTransfers: boolean;
  collapseMatched: boolean;
  showFees: boolean;
}

// Account statement processing interfaces
export interface AccountStatementAnalysisRequest {
  fileContent: string;
  fileName: string;
  fileType: 'pdf' | 'csv' | 'excel' | 'image';
}

export interface AccountStatementAnalysisResponse {
  accountName?: string;
  institution?: string;
  accountType?: 'checking' | 'savings' | 'credit' | 'investment' | 'cash';
  currency?: string;
  balance?: number;
  balanceDate?: Date;
  maskedAccountNumber?: string; // Format: "Ending in XXX"
  confidence: number; // 0-1 confidence in the extraction
  reasoning: string; // AI explanation of extraction
  extractedFields: string[]; // List of fields that were successfully extracted
}
