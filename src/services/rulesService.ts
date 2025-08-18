import { CategoryRule, RuleCondition, RuleMatchResult, Transaction } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { containsUniqueIdentifiers } from '../utils/uniqueIdentifierDetection';

// Lazy import for dataService to avoid circular dependency during initialization
let dataServiceCache: any = null;
const getDataService = async () => {
  if (!dataServiceCache) {
    const { dataService } = await import('./dataService');
    dataServiceCache = dataService;
  }
  return dataServiceCache;
};

class RulesService {
  private rules: CategoryRule[] = [];
  private storageKey = 'mo-money-category-rules';

  constructor() {
    this.loadFromStorage();
  }

  // Rule CRUD operations
  async getAllRules(): Promise<CategoryRule[]> {
    return [...this.rules].sort((a, b) => a.priority - b.priority);
  }

  async getRuleById(id: string): Promise<CategoryRule | null> {
    return this.rules.find(rule => rule.id === id) || null;
  }

  async addRule(rule: Omit<CategoryRule, 'id' | 'createdDate' | 'lastModifiedDate'>): Promise<CategoryRule> {
    const now = new Date();
    const newRule: CategoryRule = {
      ...rule,
      id: uuidv4(),
      createdDate: now,
      lastModifiedDate: now,
    };

    this.rules.push(newRule);
    this.saveToStorage();
    return newRule;
  }

  async updateRule(id: string, updates: Partial<CategoryRule>): Promise<CategoryRule | null> {
    const index = this.rules.findIndex(rule => rule.id === id);
    if (index === -1) return null;

    this.rules[index] = {
      ...this.rules[index],
      ...updates,
      lastModifiedDate: new Date(),
    };

    this.saveToStorage();
    return this.rules[index];
  }

  async deleteRule(id: string): Promise<boolean> {
    const index = this.rules.findIndex(rule => rule.id === id);
    if (index === -1) return false;

    this.rules.splice(index, 1);
    this.saveToStorage();
    return true;
  }

  // Rule application methods
  async applyRules(transaction: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>): Promise<RuleMatchResult> {
    const activeRules = this.rules
      .filter(rule => rule.isActive)
      .sort((a, b) => a.priority - b.priority);

    for (const rule of activeRules) {
      if (this.evaluateRule(transaction, rule)) {
        return {
          matched: true,
          rule,
          confidence: 1.0, // Rules have 100% confidence
        };
      }
    }

    return {
      matched: false,
      confidence: 0,
    };
  }

  async applyRulesToBatch(transactions: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>[]): Promise<{
    matchedTransactions: Array<{ transaction: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>; rule: CategoryRule }>;
    unmatchedTransactions: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>[];
  }> {
    const activeRules = this.rules
      .filter(rule => rule.isActive)
      .sort((a, b) => a.priority - b.priority);

    console.log(`🔍 Rule evaluation: ${activeRules.length} active rules available for ${transactions.length} transactions`);

    const matchedTransactions: Array<{ transaction: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>; rule: CategoryRule }> = [];
    const unmatchedTransactions: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>[] = [];
    const ruleMatchCounts = new Map<string, number>();

    for (const transaction of transactions) {
      let matched = false;

      for (const rule of activeRules) {
        if (this.evaluateRule(transaction, rule)) {
          // Apply the rule's category/subcategory and optional type
          // Note: Rules don't set AI confidence - that's only for AI classifications
          const updatedTransaction = {
            ...transaction,
            category: rule.action.categoryName,
            subcategory: rule.action.subcategoryName,
            type: rule.action.transactionType || transaction.type, // Override type if specified
            confidence: undefined, // Rules don't provide AI confidence
            reasoning: undefined, // Rules don't provide AI reasoning
          };
          matchedTransactions.push({ transaction: updatedTransaction, rule });
          
          // Track rule usage
          const count = ruleMatchCounts.get(rule.name) || 0;
          ruleMatchCounts.set(rule.name, count + 1);
          
          matched = true;
          break; // First matching rule wins (priority order)
        }
      }

      if (!matched) {
        unmatchedTransactions.push(transaction);
      }
    }

    // Enhanced logging of rule effectiveness
    if (matchedTransactions.length > 0) {
      console.log(`📊 Rule match breakdown:`);
      const sortedRuleMatches = Array.from(ruleMatchCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5); // Show top 5 most effective rules
      
      sortedRuleMatches.forEach(([ruleName, count]) => {
        const percentage = Math.round((count / transactions.length) * 100);
        console.log(`   📋 "${ruleName}": ${count} matches (${percentage}%)`);
      });
      
      if (ruleMatchCounts.size > 5) {
        const otherRulesCount = Array.from(ruleMatchCounts.values()).slice(5).reduce((sum, count) => sum + count, 0);
        console.log(`   📋 ${ruleMatchCounts.size - 5} other rules: ${otherRulesCount} matches`);
      }
    } else {
      console.log(`⚠️ No rule matches found - all ${transactions.length} transactions will need AI classification`);
    }

    return { matchedTransactions, unmatchedTransactions };
  }

  // Rule evaluation logic
  private evaluateRule(transaction: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>, rule: CategoryRule): boolean {
    return rule.conditions.every(condition => this.evaluateCondition(transaction, condition));
  }

  private evaluateCondition(transaction: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>, condition: RuleCondition): boolean {
    let fieldValue: any;

    switch (condition.field) {
      case 'description':
        fieldValue = transaction.description;
        break;
      case 'amount':
        fieldValue = Math.abs(transaction.amount); // Use absolute value for amount comparisons
        break;
      case 'account':
        fieldValue = transaction.account;
        break;
      case 'date':
        fieldValue = transaction.date;
        break;
      default:
        return false;
    }

    return this.applyOperator(fieldValue, condition.operator, condition.value, condition.valueEnd, condition.caseSensitive);
  }

  private applyOperator(
    fieldValue: any,
    operator: RuleCondition['operator'],
    value: string | number | Date,
    valueEnd?: string | number | Date,
    caseSensitive?: boolean
  ): boolean {
    if (fieldValue == null || fieldValue === undefined) {
      return false;
    }

    switch (operator) {
      case 'equals':
        if (typeof fieldValue === 'string' && typeof value === 'string') {
          return caseSensitive
            ? fieldValue === value
            : fieldValue.toLowerCase() === value.toLowerCase();
        }
        return fieldValue === value;

      case 'contains':
        if (typeof fieldValue === 'string' && typeof value === 'string') {
          const field = caseSensitive ? fieldValue : fieldValue.toLowerCase();
          const val = caseSensitive ? value : value.toLowerCase();
          return field.includes(val);
        }
        return false;

      case 'startsWith':
        if (typeof fieldValue === 'string' && typeof value === 'string') {
          const field = caseSensitive ? fieldValue : fieldValue.toLowerCase();
          const val = caseSensitive ? value : value.toLowerCase();
          return field.startsWith(val);
        }
        return false;

      case 'endsWith':
        if (typeof fieldValue === 'string' && typeof value === 'string') {
          const field = caseSensitive ? fieldValue : fieldValue.toLowerCase();
          const val = caseSensitive ? value : value.toLowerCase();
          return field.endsWith(val);
        }
        return false;

      case 'greaterThan':
        if (typeof fieldValue === 'number' && typeof value === 'number') {
          return fieldValue > value;
        }
        if (fieldValue instanceof Date) {
          let compareDate: Date;
          if (value instanceof Date) {
            compareDate = value;
          } else {
            compareDate = new Date(String(value));
          }
          return !isNaN(compareDate.getTime()) && fieldValue > compareDate;
        }
        return false;

      case 'lessThan':
        if (typeof fieldValue === 'number' && typeof value === 'number') {
          return fieldValue < value;
        }
        if (fieldValue instanceof Date) {
          let compareDate: Date;
          if (value instanceof Date) {
            compareDate = value;
          } else {
            compareDate = new Date(String(value));
          }
          return !isNaN(compareDate.getTime()) && fieldValue < compareDate;
        }
        return false;

      case 'between':
        if (typeof fieldValue === 'number' && typeof value === 'number' && typeof valueEnd === 'number') {
          return fieldValue >= value && fieldValue <= valueEnd;
        }
        if (fieldValue instanceof Date && valueEnd != null) {
          let startDate: Date;
          let endDate: Date;
          if (value instanceof Date) {
            startDate = value;
          } else {
            startDate = new Date(String(value));
          }
          if (valueEnd instanceof Date) {
            endDate = valueEnd;
          } else {
            endDate = new Date(String(valueEnd));
          }
          return !isNaN(startDate.getTime()) && !isNaN(endDate.getTime()) && 
                 fieldValue >= startDate && fieldValue <= endDate;
        }
        return false;

      case 'regex':
        if (typeof fieldValue === 'string' && typeof value === 'string') {
          try {
            const flags = caseSensitive ? 'g' : 'gi';
            const regex = new RegExp(value, flags);
            return regex.test(fieldValue);
          } catch {
            return false; // Invalid regex
          }
        }
        return false;

      default:
        return false;
    }
  }

  // Create common rule templates
  async createDescriptionContainsRule(
    name: string,
    keyword: string,
    categoryName: string,
    subcategoryName?: string,
    priority: number = 100
  ): Promise<CategoryRule> {
    return this.addRule({
      name,
      description: `Auto-generated rule for transactions containing "${keyword}"`,
      isActive: true,
      priority,
      conditions: [
        {
          field: 'description',
          operator: 'contains',
          value: keyword,
          caseSensitive: false,
        },
      ],
      action: {
        categoryId: this.getCategoryIdByName(categoryName) || 'uncategorized',
        categoryName,
        subcategoryId: subcategoryName ? this.getSubcategoryIdByName(subcategoryName, categoryName) : undefined,
        subcategoryName,
      },
    });
  }

  // Auto-generate rule from AI classification for unique account + description combination
  async createAutoRuleFromAI(
    account: string,
    description: string,
    categoryName: string,
    subcategoryName?: string,
    confidence: number = 1.0
  ): Promise<CategoryRule> {
    // First, check if the transaction description contains unique identifiers
    if (containsUniqueIdentifiers(description)) {
      console.log(`⚠️  Skipping auto-rule creation for "${description}" - contains unique identifiers that would make the rule ineffective`);
      throw new Error('Transaction description contains unique identifiers - auto-rule would be ineffective');
    }

    // Check if a rule already exists for this exact account + description combination
    const existingRule = this.rules.find(rule => 
      rule.isActive && 
      rule.conditions.length === 2 &&
      rule.conditions.some(c => c.field === 'account' && c.operator === 'equals' && c.value === account) &&
      rule.conditions.some(c => c.field === 'description' && c.operator === 'equals' && c.value === description)
    );

    if (existingRule) {
      console.log(`Auto-rule already exists for ${account} + "${description}"`);
      return existingRule;
    }

    const ruleName = `Auto: ${description} (${account})`;
    const ruleDescription = `Auto-generated from AI classification (confidence: ${Math.round(confidence * 100)}%)`;
    
    return this.addRule({
      name: ruleName,
      description: ruleDescription,
      isActive: true,
      priority: 50, // Higher priority than manual rules (lower number = higher priority)
      conditions: [
        {
          field: 'account',
          operator: 'equals',
          value: account,
          caseSensitive: false,
        },
        {
          field: 'description',
          operator: 'equals',
          value: description,
          caseSensitive: false,
        },
      ],
      action: {
        categoryId: this.getCategoryIdByName(categoryName) || 'uncategorized',
        categoryName,
        subcategoryId: subcategoryName ? this.getSubcategoryIdByName(subcategoryName, categoryName) : undefined,
        subcategoryName,
      },
    });
  }

  // Create or update rule from user manual categorization
  async createOrUpdateRuleFromUserEdit(
    account: string,
    description: string,
    categoryName: string,
    subcategoryName?: string,
    applyToExisting: boolean = false
  ): Promise<{ rule: CategoryRule; isNew: boolean; reclassifiedCount?: number }> {
    // Check if a rule already exists for this exact account + description combination
    const existingRuleIndex = this.rules.findIndex(rule => 
      rule.isActive && 
      rule.conditions.length === 2 &&
      rule.conditions.some(c => c.field === 'account' && c.operator === 'equals' && c.value === account) &&
      rule.conditions.some(c => c.field === 'description' && c.operator === 'equals' && c.value === description)
    );

    let rule: CategoryRule;
    let isNew: boolean = false;
    let reclassifiedCount: number | undefined;

    if (existingRuleIndex !== -1) {
      // Update existing rule
      const updates: Partial<CategoryRule> = {
        action: {
          categoryId: this.getCategoryIdByName(categoryName) || 'uncategorized',
          categoryName,
          subcategoryId: subcategoryName ? this.getSubcategoryIdByName(subcategoryName, categoryName) : undefined,
          subcategoryName,
        },
        lastModifiedDate: new Date(),
      };

      rule = await this.updateRule(this.rules[existingRuleIndex].id, updates) as CategoryRule;
      console.log(`Updated existing auto-rule for ${account} + "${description}"`);
    } else {
      // Create new rule
      const ruleName = `User: ${description} (${account})`;
      const ruleDescription = `Created from user manual categorization`;
      
      rule = await this.addRule({
        name: ruleName,
        description: ruleDescription,
        isActive: true,
        priority: 25, // Very high priority for user-created rules
        conditions: [
          {
            field: 'account',
            operator: 'equals',
            value: account,
            caseSensitive: false,
          },
          {
            field: 'description',
            operator: 'equals',
            value: description,
            caseSensitive: false,
          },
        ],
        action: {
          categoryId: this.getCategoryIdByName(categoryName) || 'uncategorized',
          categoryName,
          subcategoryId: subcategoryName ? this.getSubcategoryIdByName(subcategoryName, categoryName) : undefined,
          subcategoryName,
        },
      });
      
      isNew = true;
      console.log(`Created new user-rule for ${account} + "${description}"`);
    }

    // If requested, reclassify existing transactions
    if (applyToExisting) {
      reclassifiedCount = await this.reclassifyExistingTransactions(rule);
    }

    return { rule, isNew, reclassifiedCount };
  }

  // Reclassify existing transactions that match a rule
  async reclassifyExistingTransactions(rule: CategoryRule): Promise<number> {
    try {
      // Use cached lazy import to avoid circular dependency
      const dataService = await getDataService();
      
      const allTransactions = await dataService.getAllTransactions();
      const batchUpdates: Array<{
        id: string;
        updates: Partial<Transaction>;
        note?: string;
      }> = [];

      for (const transaction of allTransactions) {
        // Create a transaction-like object for rule evaluation
        const transactionForRule = {
          date: transaction.date,
          description: transaction.description,
          amount: transaction.amount,
          account: transaction.account,
          category: transaction.category, // Add required fields
          type: transaction.type,
        };

        // Check if this transaction matches the rule conditions
        if (this.evaluateRule(transactionForRule, rule)) {
          // Only update if the categorization would actually change
          const wouldChange = transaction.category !== rule.action.categoryName || 
                            transaction.subcategory !== rule.action.subcategoryName;

          if (wouldChange) {
            const updates: Partial<Transaction> = {
              category: rule.action.categoryName,
              subcategory: rule.action.subcategoryName,
              confidence: 1.0,
              reasoning: `Reclassified by rule: ${rule.name}`,
              isVerified: false, // Mark as unverified since it was auto-changed
            };
            
            // Apply transaction type if specified in the rule
            if (rule.action.transactionType) {
              updates.type = rule.action.transactionType;
            }
            
            batchUpdates.push({
              id: transaction.id,
              updates,
              note: `Reclassified by rule: ${rule.name}`
            });
          }
        }
      }

      // Perform all updates in a single batch operation
      if (batchUpdates.length > 0) {
        await dataService.batchUpdateTransactions(batchUpdates, { skipHistory: true });
      }

      console.log(`Reclassified ${batchUpdates.length} existing transactions using rule: ${rule.name}`);
      return batchUpdates.length;
    } catch (error) {
      console.error('Failed to reclassify existing transactions:', error);
      return 0;
    }
  }

  // Helper methods for category/subcategory mapping
  private getCategoryIdByName(categoryName: string): string | undefined {
    // In a real implementation, this would query the categories service
    // For now, we'll use a simple mapping based on common categories
    const mapping: { [key: string]: string } = {
      'Transportation': 'transportation',
      'Food & Dining': 'food-dining',
      'Shopping': 'shopping',
      'Entertainment': 'entertainment',
      'Bills & Utilities': 'bills-utilities',
      'Income': 'income',
      'Healthcare': 'healthcare',
      'Travel': 'travel',
      'Housing': 'housing',
    };
    return mapping[categoryName] || categoryName.toLowerCase().replace(/\s+/g, '-');
  }

  private getSubcategoryIdByName(subcategoryName: string, categoryName: string): string | undefined {
    // Simple ID generation - in a real implementation, this would use the categories service
    return `${this.getCategoryIdByName(categoryName)}-${subcategoryName.toLowerCase().replace(/\s+/g, '-')}`;
  }

  // Storage operations
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        this.rules = data.map((r: any) => ({
          ...r,
          createdDate: new Date(r.createdDate),
          lastModifiedDate: new Date(r.lastModifiedDate),
        }));
      }
    } catch (error) {
      console.error('Failed to load category rules from storage:', error);
      this.rules = [];
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.rules));
    } catch (error) {
      console.error('Failed to save category rules to storage:', error);
    }
  }

  // Initialize rules from existing transactions if no rules exist
  async initializeRulesFromExistingTransactions(): Promise<number> {
    try {
      // Use cached lazy import to avoid circular dependency
      const dataService = await getDataService();
      
      const allTransactions = await dataService.getAllTransactions();
      let rulesCreated = 0;
      
      // Track processed combinations to avoid duplicates within this run
      const processedCombinations = new Set<string>();

      for (const transaction of allTransactions) {
        // Only create rules for high-confidence AI categorizations (>= 80%)
        if (transaction.confidence && transaction.confidence >= 0.8 && 
            transaction.category && 
            transaction.category !== 'uncategorized' && 
            transaction.category !== 'Uncategorized' &&
            transaction.account && 
            transaction.description) {
          
          // Create a unique key for this account + description combination
          const combinationKey = `${transaction.account}|||${transaction.description}`;
          
          // Skip if we already processed this combination in this run
          if (processedCombinations.has(combinationKey)) {
            continue;
          }
          processedCombinations.add(combinationKey);
          
          try {
            const rule = await this.createAutoRuleFromAI(
              transaction.account,
              transaction.description,
              transaction.category,
              transaction.subcategory,
              transaction.confidence
            );
            
            // Only count as created if it's a new rule (not an existing one)
            if (rule.createdDate.getTime() > Date.now() - 1000) { // Created in last second
              rulesCreated++;
              console.log(`📋 Auto-created rule for: ${transaction.description} (${transaction.account}) → ${transaction.category}`);
            }
          } catch (error) {
            // Don't fail the whole process if individual rule creation fails
            console.warn(`Failed to create auto-rule for transaction ${transaction.id}:`, error);
          }
        }
      }

      console.log(`Created ${rulesCreated} auto-rules from existing transactions (${allTransactions.length} total transactions analyzed)`);
      return rulesCreated;
    } catch (error) {
      console.error('Failed to initialize rules from existing transactions:', error);
      return 0;
    }
  }

  // Utility methods
  async getStats(): Promise<{
    totalRules: number;
    activeRules: number;
    inactiveRules: number;
  }> {
    const activeRules = this.rules.filter(rule => rule.isActive);
    return {
      totalRules: this.rules.length,
      activeRules: activeRules.length,
      inactiveRules: this.rules.length - activeRules.length,
    };
  }

  async clearAllRules(options?: {
    system?: boolean;
    autoGenerated?: boolean;
    userDefined?: boolean;
  }): Promise<void> {
    if (!options || (!options.system && !options.autoGenerated && !options.userDefined)) {
      // Default behavior: delete all rules for backward compatibility
      this.rules = [];
    } else {
      // Selective deletion based on rule types
      this.rules = this.rules.filter(rule => {
        // Determine rule type
        const isSystemRule = rule.name.startsWith('Transfer Detection:') ||
          rule.name.includes('Bank Fee Protection') ||
          (rule.description && rule.description.includes('Auto-generated rule to detect transfer')) ||
          (rule.priority === 10 || rule.priority === 5);

        const isAutoRule = rule.name.startsWith('Auto:') ||
          (rule.description && rule.description.includes('Auto-generated from AI classification')) ||
          (rule.priority === 50);

        const isUserRule = rule.name.startsWith('User:') ||
          (rule.description && rule.description.includes('Created from user manual categorization')) ||
          (rule.priority === 25);

        // Manual rules are treated as user-defined rules
        const isManualRule = !isSystemRule && !isAutoRule && !isUserRule;
        const isUserDefinedRule = isUserRule || isManualRule;

        // Keep rule if it's NOT of a type that should be deleted
        if (options.system && isSystemRule) return false;
        if (options.autoGenerated && isAutoRule) return false;
        if (options.userDefined && isUserDefinedRule) return false;

        return true;
      });
    }
    
    this.saveToStorage();
  }

  // Import a full set of rules (used by backup restore)
  async importRules(rules: CategoryRule[]): Promise<void> {
    // Normalize date fields
    this.rules = rules.map(r => ({
      ...r,
      createdDate: new Date(r.createdDate),
      lastModifiedDate: new Date(r.lastModifiedDate),
    }));
    this.saveToStorage();
  }
}

// Create singleton instance
export const rulesService = new RulesService();
export default rulesService;