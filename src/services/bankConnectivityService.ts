import { 
  BankConnection, 
  BankAccount, 
  BankTransaction, 
  BankSyncResult,
  Transaction 
} from '../types';
import { v4 as uuidv4 } from 'uuid';

// Mock Plaid API service for development
// In production, this would integrate with actual Plaid API
class BankConnectivityService {
  private connections: BankConnection[] = [];
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      // Load existing connections from localStorage
      const stored = localStorage.getItem('bankConnections');
      if (stored) {
        const connections = JSON.parse(stored);
        this.connections = connections.map((conn: any) => ({
          ...conn,
          connectedDate: new Date(conn.connectedDate),
          lastSyncDate: conn.lastSyncDate ? new Date(conn.lastSyncDate) : undefined
        }));
      }
      
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize BankConnectivityService:', error);
      this.connections = [];
      this.isInitialized = true;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  private async saveConnections(): Promise<void> {
    try {
      localStorage.setItem('bankConnections', JSON.stringify(this.connections));
    } catch (error) {
      console.error('Failed to save bank connections:', error);
    }
  }

  /**
   * Get all bank connections
   */
  async getConnections(): Promise<BankConnection[]> {
    await this.ensureInitialized();
    return [...this.connections];
  }

  /**
   * Get connection by ID
   */
  async getConnection(id: string): Promise<BankConnection | null> {
    await this.ensureInitialized();
    return this.connections.find(conn => conn.id === id) || null;
  }

  /**
   * Create Plaid Link token for bank connection
   * In development mode, returns mock token
   */
  async createLinkToken(): Promise<string> {
    // In production, this would call Plaid API to create a link token
    // For development, return a mock token
    return 'mock_link_token_' + Date.now();
  }

  /**
   * Exchange public token for access token and create connection
   * In development mode, creates mock connection
   */
  async exchangePublicToken(publicToken: string, institutionName: string): Promise<BankConnection> {
    await this.ensureInitialized();

    // In production, this would call Plaid API to exchange tokens
    // For development, create mock connection
    const mockConnection: BankConnection = {
      id: uuidv4(),
      institutionId: institutionName.toLowerCase().replace(/\s+/g, '_'),
      institutionName,
      plaidItemId: 'mock_item_' + Date.now(),
      accessToken: 'mock_access_token_' + Date.now(), // In production, this would be encrypted
      connectedDate: new Date(),
      isActive: true,
      accounts: this.generateMockAccounts(institutionName)
    };

    this.connections.push(mockConnection);
    await this.saveConnections();

    return mockConnection;
  }

  /**
   * Generate mock bank accounts for development
   */
  private generateMockAccounts(institutionName: string): BankAccount[] {
    const accounts: BankAccount[] = [];
    
    // Generate different account types based on institution
    if (institutionName.toLowerCase().includes('chase')) {
      accounts.push({
        id: uuidv4(),
        plaidAccountId: 'chase_checking_' + Date.now(),
        name: 'Chase Total Checking',
        officialName: 'Chase Total Checking',
        type: 'checking',
        subtype: 'checking',
        mask: '1234',
        availableBalance: 2500.75,
        currentBalance: 2500.75,
        isoCurrencyCode: 'USD',
        isEnabled: true
      });
      
      accounts.push({
        id: uuidv4(),
        plaidAccountId: 'chase_savings_' + Date.now(),
        name: 'Chase Savings',
        officialName: 'Chase Savings',
        type: 'savings',
        subtype: 'savings',
        mask: '5678',
        availableBalance: 15000.00,
        currentBalance: 15000.00,
        isoCurrencyCode: 'USD',
        isEnabled: true
      });
    } else if (institutionName.toLowerCase().includes('firsttech')) {
      accounts.push({
        id: uuidv4(),
        plaidAccountId: 'firsttech_checking_' + Date.now(),
        name: 'FirstTech Checking',
        officialName: 'FirstTech Federal Credit Union Checking',
        type: 'checking',
        subtype: 'checking',
        mask: '9876',
        availableBalance: 1200.50,
        currentBalance: 1200.50,
        isoCurrencyCode: 'USD',
        isEnabled: true
      });
      
      accounts.push({
        id: uuidv4(),
        plaidAccountId: 'firsttech_savings_' + Date.now(),
        name: 'FirstTech Share Savings',
        officialName: 'FirstTech Federal Credit Union Share Savings',
        type: 'savings',
        subtype: 'savings',
        mask: '5432',
        availableBalance: 8500.25,
        currentBalance: 8500.25,
        isoCurrencyCode: 'USD',
        isEnabled: true
      });
    }

    return accounts;
  }

  /**
   * Sync transactions from bank for the last 90 days
   */
  async syncTransactions(connectionId: string, accountId?: string): Promise<BankSyncResult[]> {
    await this.ensureInitialized();
    
    const connection = this.connections.find(conn => conn.id === connectionId);
    if (!connection) {
      throw new Error('Bank connection not found');
    }

    const results: BankSyncResult[] = [];
    const accountsToSync = accountId 
      ? connection.accounts.filter(acc => acc.id === accountId && acc.isEnabled)
      : connection.accounts.filter(acc => acc.isEnabled);

    for (const account of accountsToSync) {
      // In production, this would call Plaid API to get transactions
      // For development, generate mock transactions
      const mockTransactions = this.generateMockTransactions(account, connection.institutionName);
      
      results.push({
        connectionId,
        accountId: account.id,
        newTransactions: mockTransactions.length,
        updatedTransactions: 0,
        errors: [],
        syncDate: new Date()
      });
    }

    // Update last sync date
    connection.lastSyncDate = new Date();
    await this.saveConnections();

    return results;
  }

  /**
   * Generate mock transactions for development
   */
  private generateMockTransactions(account: BankAccount, institutionName: string): BankTransaction[] {
    const transactions: BankTransaction[] = [];
    const now = new Date();
    const startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); // 90 days ago

    // Generate 15-25 mock transactions
    const transactionCount = Math.floor(Math.random() * 10) + 15;
    
    const mockMerchants = [
      'Starbucks', 'Amazon.com', 'Shell Gas Station', 'Grocery Outlet',
      'Target', 'McDonald\'s', 'Home Depot', 'Costco', 'Netflix',
      'Spotify', 'Electric Company', 'Internet Provider', 'Phone Bill'
    ];

    for (let i = 0; i < transactionCount; i++) {
      const transactionDate = new Date(
        startDate.getTime() + Math.random() * (now.getTime() - startDate.getTime())
      );
      
      const isIncome = Math.random() < 0.1; // 10% chance of income
      const amount = isIncome 
        ? Math.round((Math.random() * 2000 + 1000) * 100) / 100 // $1000-3000 income
        : Math.round((Math.random() * 200 + 5) * 100) / 100; // $5-205 expense

      const merchant = mockMerchants[Math.floor(Math.random() * mockMerchants.length)];
      
      transactions.push({
        plaidTransactionId: `mock_txn_${account.plaidAccountId}_${i}_${Date.now()}`,
        accountId: account.id,
        amount: isIncome ? amount : -amount, // Negative for expenses
        date: transactionDate,
        name: isIncome ? 'Payroll Deposit' : merchant,
        merchantName: isIncome ? 'Employer' : merchant,
        category: isIncome ? ['Transfer', 'Payroll'] : ['Food and Drink', 'Restaurants'],
        isoCurrencyCode: 'USD',
        paymentChannel: Math.random() < 0.7 ? 'in store' : 'online',
        pending: Math.random() < 0.05 // 5% chance of pending
      });
    }

    return transactions.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  /**
   * Convert bank transaction to app transaction format
   */
  convertToAppTransaction(bankTxn: BankTransaction, accountName: string): Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'> {
    return {
      date: bankTxn.date,
      amount: Math.abs(bankTxn.amount),
      description: bankTxn.name,
      category: 'Uncategorized', // Will be categorized by AI
      account: accountName,
      type: bankTxn.amount > 0 ? 'income' : 'expense',
      originalText: bankTxn.name,
      vendor: bankTxn.merchantName,
      location: bankTxn.location ? 
        `${bankTxn.location.city || ''}, ${bankTxn.location.region || ''}`.trim().replace(/^,\s*/, '') : 
        undefined,
      notes: bankTxn.pending ? 'Pending transaction from bank' : undefined
    };
  }

  /**
   * Remove bank connection
   */
  async removeConnection(connectionId: string): Promise<void> {
    await this.ensureInitialized();
    
    const index = this.connections.findIndex(conn => conn.id === connectionId);
    if (index > -1) {
      this.connections.splice(index, 1);
      await this.saveConnections();
    }
  }

  /**
   * Update account sync settings
   */
  async updateAccountSettings(connectionId: string, accountId: string, isEnabled: boolean): Promise<void> {
    await this.ensureInitialized();
    
    const connection = this.connections.find(conn => conn.id === connectionId);
    if (connection) {
      const account = connection.accounts.find(acc => acc.id === accountId);
      if (account) {
        account.isEnabled = isEnabled;
        await this.saveConnections();
      }
    }
  }

  /**
   * Get supported institutions
   */
  getSupportedInstitutions(): Array<{ id: string; name: string; logo?: string }> {
    return [
      { id: 'chase', name: 'Chase Bank' },
      { id: 'firsttech', name: 'FirstTech Federal Credit Union' },
      // Add more institutions as needed
    ];
  }
}

export const bankConnectivityService = new BankConnectivityService();