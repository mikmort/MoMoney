import { CategoryRule, RuleCondition, RuleAction, RuleMatchResult, Transaction } from '../types';
import { v4 as uuidv4 } from 'uuid';

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

    const matchedTransactions: Array<{ transaction: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>; rule: CategoryRule }> = [];
    const unmatchedTransactions: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>[] = [];

    for (const transaction of transactions) {
      let matched = false;

      for (const rule of activeRules) {
        if (this.evaluateRule(transaction, rule)) {
          // Apply the rule's category/subcategory
          const updatedTransaction = {
            ...transaction,
            category: rule.action.categoryName,
            subcategory: rule.action.subcategoryName,
            confidence: 1.0,
            reasoning: `Matched rule: ${rule.name}`,
          };
          matchedTransactions.push({ transaction: updatedTransaction, rule });
          matched = true;
          break; // First matching rule wins (priority order)
        }
      }

      if (!matched) {
        unmatchedTransactions.push(transaction);
      }
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

  // Create auto-rule from AI categorization result
  async createAutoRuleFromAI(
    account: string,
    description: string,
    categoryName: string,
    subcategoryName?: string,
    confidence: number = 1.0
  ): Promise<CategoryRule> {
    const ruleName = `Auto: ${account} - ${description.substring(0, 30)}${description.length > 30 ? '...' : ''}`;
    
    // Check if a similar rule already exists to avoid duplicates
    const existingRule = await this.findExistingAutoRule(account, description);
    if (existingRule) {
      console.log(`Auto-rule already exists for ${account} - ${description}`);
      return existingRule;
    }

    return this.addRule({
      name: ruleName,
      description: `Auto-generated from AI categorization (confidence: ${Math.round(confidence * 100)}%)`,
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

  // Find existing auto-rule for the same account + description combination
  private async findExistingAutoRule(account: string, description: string): Promise<CategoryRule | null> {
    return this.rules.find(rule => {
      if (!rule.name.startsWith('Auto:')) return false;
      
      const hasAccountCondition = rule.conditions.some(c => 
        c.field === 'account' && 
        c.operator === 'equals' && 
        String(c.value).toLowerCase() === account.toLowerCase()
      );
      
      const hasDescriptionCondition = rule.conditions.some(c => 
        c.field === 'description' && 
        c.operator === 'equals' && 
        String(c.value).toLowerCase() === description.toLowerCase()
      );
      
      return hasAccountCondition && hasDescriptionCondition;
    }) || null;
  }

  // Create or update rule from user manual categorization
  async createOrUpdateUserRule(
    account: string,
    description: string,
    categoryName: string,
    subcategoryName?: string,
    ruleType: 'exact' | 'contains' | 'startsWith' = 'exact'
  ): Promise<CategoryRule> {
    const operator = ruleType === 'exact' ? 'equals' : ruleType === 'contains' ? 'contains' : 'startsWith';
    const ruleName = `User: ${account} - ${description.substring(0, 30)}${description.length > 30 ? '...' : ''}`;
    
    // Check if a user rule already exists for this combination
    const existingRule = await this.findExistingUserRule(account, description, ruleType);
    if (existingRule) {
      // Update existing rule with new category
      return await this.updateRule(existingRule.id, {
        action: {
          categoryId: this.getCategoryIdByName(categoryName) || 'uncategorized',
          categoryName,
          subcategoryId: subcategoryName ? this.getSubcategoryIdByName(subcategoryName, categoryName) : undefined,
          subcategoryName,
        },
        lastModifiedDate: new Date(),
      }) as CategoryRule;
    }

    // Create new rule
    return this.addRule({
      name: ruleName,
      description: `User-created rule from manual categorization`,
      isActive: true,
      priority: 25, // Higher priority than auto rules
      conditions: [
        {
          field: 'account',
          operator: 'equals',
          value: account,
          caseSensitive: false,
        },
        {
          field: 'description',
          operator,
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

  // Find existing user rule for the same account + description combination
  private async findExistingUserRule(
    account: string, 
    description: string, 
    ruleType: 'exact' | 'contains' | 'startsWith' = 'exact'
  ): Promise<CategoryRule | null> {
    const operator = ruleType === 'exact' ? 'equals' : ruleType === 'contains' ? 'contains' : 'startsWith';
    
    return this.rules.find(rule => {
      if (!rule.name.startsWith('User:')) return false;
      
      const hasAccountCondition = rule.conditions.some(c => 
        c.field === 'account' && 
        c.operator === 'equals' && 
        String(c.value).toLowerCase() === account.toLowerCase()
      );
      
      const hasDescriptionCondition = rule.conditions.some(c => 
        c.field === 'description' && 
        c.operator === operator && 
        String(c.value).toLowerCase() === description.toLowerCase()
      );
      
      return hasAccountCondition && hasDescriptionCondition;
    }) || null;
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

  async clearAllRules(): Promise<void> {
    this.rules = [];
    this.saveToStorage();
  }
}

// Create singleton instance
export const rulesService = new RulesService();
export default rulesService;