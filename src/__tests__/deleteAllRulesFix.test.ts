import { rulesService } from '../services/rulesService';
import { CategoryRule } from '../types';

describe('Delete All Rules Functionality', () => {
  beforeEach(async () => {
    // Clear any existing rules
    const allRules = await rulesService.getAllRules();
    for (const rule of allRules) {
      await rulesService.deleteRule(rule.id);
    }
  });

  afterEach(async () => {
    // Clean up after tests
    const allRules = await rulesService.getAllRules();
    for (const rule of allRules) {
      await rulesService.deleteRule(rule.id);
    }
  });

  const createTestRules = async (): Promise<CategoryRule[]> => {
    // Create system rule (transfer detection)
    const systemRule = await rulesService.addRule({
      name: 'Transfer Detection: ach transfer',
      description: 'Auto-generated rule to detect transfer transactions',
      isActive: true,
      priority: 10,
      conditions: [{
        field: 'description',
        operator: 'contains',
        value: 'ach transfer',
        caseSensitive: false
      }],
      action: {
        categoryId: 'internal-transfer',
        categoryName: 'Internal Transfer'
      }
    });

    // Create auto-generated rule
    const autoRule = await rulesService.addRule({
      name: 'Auto: Spotify (Chase Checking)',
      description: 'Auto-generated from AI classification',
      isActive: true,
      priority: 50,
      conditions: [{
        field: 'description',
        operator: 'contains',
        value: 'SPOTIFY',
        caseSensitive: false
      }],
      action: {
        categoryId: 'entertainment',
        categoryName: 'Entertainment',
        subcategoryId: 'entertainment-streaming',
        subcategoryName: 'Streaming Services'
      }
    });

    // Create user-defined rule
    const userRule = await rulesService.addRule({
      name: 'User: Coffee Shops',
      description: 'Created from user manual categorization',
      isActive: true,
      priority: 25,
      conditions: [{
        field: 'description',
        operator: 'contains',
        value: 'STARBUCKS',
        caseSensitive: false
      }],
      action: {
        categoryId: 'food',
        categoryName: 'Food & Dining',
        subcategoryId: 'food-coffee',
        subcategoryName: 'Coffee Shops'
      }
    });

    return [systemRule, autoRule, userRule];
  };

  test('should categorize rules correctly by type', async () => {
    const rules = await createTestRules();
    const allRules = await rulesService.getAllRules();

    expect(allRules).toHaveLength(3);

    // System rules
    const systemRules = allRules.filter(rule =>
      rule.name.startsWith('Transfer Detection:') ||
      rule.name.includes('Bank Fee Protection') ||
      (rule.description && rule.description.includes('Auto-generated rule to detect transfer')) ||
      (rule.priority === 10 || rule.priority === 5)
    );
    expect(systemRules).toHaveLength(1);
    expect(systemRules[0].name).toBe('Transfer Detection: ach transfer');

    // Auto-generated rules
    const autoRules = allRules.filter(rule =>
      rule.name.startsWith('Auto:') ||
      (rule.description && rule.description.includes('Auto-generated from AI classification')) ||
      (rule.priority === 50)
    );
    expect(autoRules).toHaveLength(1);
    expect(autoRules[0].name).toBe('Auto: Spotify (Chase Checking)');

    // User-defined rules
    const userRules = allRules.filter(rule =>
      rule.name.startsWith('User:') ||
      (rule.description && rule.description.includes('Created from user manual categorization')) ||
      (rule.priority === 25)
    );
    expect(userRules).toHaveLength(1);
    expect(userRules[0].name).toBe('User: Coffee Shops');
  });

  test('current clearAllRules() should delete ALL rules (documenting current bug)', async () => {
    await createTestRules();
    
    let allRules = await rulesService.getAllRules();
    expect(allRules).toHaveLength(3);

    // Current behavior - deletes ALL rules indiscriminately
    await rulesService.clearAllRules();

    allRules = await rulesService.getAllRules();
    expect(allRules).toHaveLength(0);
  });

  test('enhanced clearAllRules() should allow selective deletion by rule type', async () => {
    await createTestRules();
    
    let allRules = await rulesService.getAllRules();
    expect(allRules).toHaveLength(3);

    // Test deleting only user-defined rules
    await rulesService.clearAllRules({ userDefined: true });

    allRules = await rulesService.getAllRules();
    expect(allRules).toHaveLength(2);
    
    // Should still have system and auto rules
    const remainingNames = allRules.map(r => r.name);
    expect(remainingNames).toContain('Transfer Detection: ach transfer');
    expect(remainingNames).toContain('Auto: Spotify (Chase Checking)');
    expect(remainingNames).not.toContain('User: Coffee Shops');
  });

  test('enhanced clearAllRules() should allow deleting auto-generated rules only', async () => {
    await createTestRules();
    
    let allRules = await rulesService.getAllRules();
    expect(allRules).toHaveLength(3);

    // Test deleting only auto-generated rules
    await rulesService.clearAllRules({ autoGenerated: true });

    allRules = await rulesService.getAllRules();
    expect(allRules).toHaveLength(2);
    
    // Should still have system and user rules
    const remainingNames = allRules.map(r => r.name);
    expect(remainingNames).toContain('Transfer Detection: ach transfer');
    expect(remainingNames).toContain('User: Coffee Shops');
    expect(remainingNames).not.toContain('Auto: Spotify (Chase Checking)');
  });

  test('enhanced clearAllRules() should allow deleting system rules only', async () => {
    await createTestRules();
    
    let allRules = await rulesService.getAllRules();
    expect(allRules).toHaveLength(3);

    // Test deleting only system rules
    await rulesService.clearAllRules({ system: true });

    allRules = await rulesService.getAllRules();
    expect(allRules).toHaveLength(2);
    
    // Should still have auto and user rules
    const remainingNames = allRules.map(r => r.name);
    expect(remainingNames).toContain('Auto: Spotify (Chase Checking)');
    expect(remainingNames).toContain('User: Coffee Shops');
    expect(remainingNames).not.toContain('Transfer Detection: ach transfer');
  });

  test('enhanced clearAllRules() should allow deleting multiple rule types', async () => {
    await createTestRules();
    
    let allRules = await rulesService.getAllRules();
    expect(allRules).toHaveLength(3);

    // Test deleting both system and auto-generated rules
    await rulesService.clearAllRules({ system: true, autoGenerated: true });

    allRules = await rulesService.getAllRules();
    expect(allRules).toHaveLength(1);
    
    // Should only have user rule
    expect(allRules[0].name).toBe('User: Coffee Shops');
  });

  test('enhanced clearAllRules() should delete all rules when no parameters provided (backward compatibility)', async () => {
    await createTestRules();
    
    let allRules = await rulesService.getAllRules();
    expect(allRules).toHaveLength(3);

    // Default behavior - should delete all rules for backward compatibility
    await rulesService.clearAllRules();

    allRules = await rulesService.getAllRules();
    expect(allRules).toHaveLength(0);
  });

  test('enhanced clearAllRules() should delete all rules when all flags are true', async () => {
    await createTestRules();
    
    let allRules = await rulesService.getAllRules();
    expect(allRules).toHaveLength(3);

    // Explicit all deletion
    await rulesService.clearAllRules({ 
      system: true, 
      autoGenerated: true, 
      userDefined: true 
    });

    allRules = await rulesService.getAllRules();
    expect(allRules).toHaveLength(0);
  });
});