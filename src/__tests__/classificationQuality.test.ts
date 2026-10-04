import { buildClassificationMessages } from '../utils/classificationPrompt';
import { defaultCategories } from '../data/defaultCategories';
import { AzureOpenAIService } from '../services/azureOpenAIService';
import { rulesService } from '../services/rulesService';
import { transferDetectionService } from '../services/transferDetectionService';
import { AIClassificationRequest } from '../types';

const request = (description = 'Spotify'): AIClassificationRequest => ({
  transactionText: description, amount: -12.99, date: '2026-01-15', availableCategories: defaultCategories
});
const transaction = (description = 'Spotify') => ({
  date: new Date('2026-01-15'), description, amount: -12.99, category: 'Uncategorized',
  account: 'Checking', type: 'expense' as const
});

describe('Classification context and correlation', () => {
  const previousEnabled = process.env.REACT_APP_AI_ENABLED;
  const previousFetch = global.fetch;
  beforeEach(() => {
    process.env.REACT_APP_AI_ENABLED = 'true';
    global.fetch = jest.fn();
  });
  afterEach(() => {
    global.fetch = previousFetch;
    if (previousEnabled === undefined) delete process.env.REACT_APP_AI_ENABLED;
    else process.env.REACT_APP_AI_ENABLED = previousEnabled;
    jest.restoreAllMocks();
  });

  it('sends names, descriptions and keywords for every category in budgeted messages', () => {
    const messages = buildClassificationMessages([request()], true);
    const catalog = messages.filter(message => message.content.startsWith('CAT:'))
      .flatMap(message => JSON.parse(message.content.slice(4)));
    expect(catalog).toHaveLength(defaultCategories.length);
    expect(catalog.find(category => category.id === 'entertainment').subcategories).toContainEqual(
      expect.objectContaining({ name: 'Streaming Services', keywords: expect.arrayContaining(['spotify']) })
    );
    expect(catalog.find(category => category.id === 'transportation').subcategories).toContainEqual(
      expect.objectContaining({ name: 'Fuel/Gas', keywords: expect.arrayContaining(['shell']) })
    );
    expect(catalog.find(category => category.id === 'food').subcategories).toContainEqual(
      expect.objectContaining({ name: 'Restaurants', description: 'Dining out' })
    );
    expect(messages.every(message => message.content.length <= 8000)).toBe(true);
    expect(messages.filter(message => message.content.startsWith('CAT:')).length).toBeGreaterThan(1);
    expect(messages[0].content).toContain('They alone do not imply an internal transfer');
  });

  it('preserves custom category meaning with opaque IDs, and safely encodes sanitized input', () => {
    const input = request('Restaurant "Krebsegaa" \\ purchase user@example.com');
    input.availableCategories = [{
      id: 'c-opaque', name: 'Meals', type: 'expense',
      subcategories: [{ id: 's-opaque', name: 'Dining out', description: 'Restaurant meals', keywords: ['restaurant'] }]
    }];
    const messages = buildClassificationMessages([input], false);
    const payload = JSON.parse(messages[messages.length - 1].content.slice(3));
    expect(payload.description).toBe('Restaurant "Krebsegaa" \\ purchase [EMAIL]');
    expect(messages[1].content).toContain('"name":"Dining out"');
  });

  it('rejects oversized catalog entries explicitly rather than dropping category context', () => {
    const input = request();
    input.availableCategories = [{
      ...defaultCategories[0], description: 'x'.repeat(8000)
    }];
    expect(() => buildClassificationMessages([input], true)).toThrow('exceeds the AI message budget');
  });

  it('maps reordered and missing batch indexes to the correct merchants', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { choices: [{ message: { content: JSON.stringify([
        { index: 2, categoryId: 'food', subcategoryId: 'food-restaurants', confidence: 0.88 },
        { index: 0, categoryId: 'entertainment', subcategoryId: 'entertainment-streaming', confidence: 0.88 }
      ]) }, finish_reason: 'stop' }] } })
    });
    const service = new AzureOpenAIService();
    const single = jest.spyOn(service, 'classifyTransaction').mockResolvedValue({
      categoryId: 'transportation', subcategoryId: 'transport-fuel', confidence: 0.85
    });
    const inputs = [request(), request('Shell'), request('Restaurant Krebsegaa')];
    const results = await service.classifyTransactionsBatch(inputs);
    expect(results.map(result => result.subcategoryId)).toEqual([
      'entertainment-streaming', undefined, 'food-restaurants'
    ]);
    expect(results[1].error?.code).toBe('invalid_response');
    expect(single).not.toHaveBeenCalled();
  });

  it('does not assign duplicate batch indexes to other transactions', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { choices: [{ message: { content: JSON.stringify([
        { index: 0, categoryId: 'food' }, { index: 0, categoryId: 'food' }
      ]) }, finish_reason: 'stop' }] } })
    });
    const service = new AzureOpenAIService();
    const single = jest.spyOn(service, 'classifyTransaction').mockResolvedValue({
      categoryId: 'uncategorized', confidence: 0.1
    });
    await service.classifyTransactionsBatch([request(), request('Shell')]);
    expect(single).not.toHaveBeenCalled();
  });
});

describe('AI rule confirmation and safe built-in rule migration', () => {
  beforeEach(async () => { await rulesService.clearAllRules(); });
  afterEach(async () => { await rulesService.clearAllRules(); });

  it('keeps AI suggestions inactive and deduplicated until explicitly enabled', async () => {
    const first = await rulesService.createAutoRuleFromAI('Checking', 'Spotify', 'Entertainment', 'Streaming Services', 0.98);
    const repeated = await rulesService.createAutoRuleFromAI('Checking', 'Spotify', 'Entertainment', 'Streaming Services', 0.99);
    expect(first.isActive).toBe(false);
    expect(repeated.id).toBe(first.id);
    expect((await rulesService.applyRules(transaction())).matched).toBe(false);
    expect((await rulesService.applyRulesToBatch([transaction()])).matchedTransactions).toHaveLength(0);
    await rulesService.updateRule(first.id, { isActive: true });
    expect((await rulesService.applyRules(transaction())).matched).toBe(true);
    await rulesService.updateRule(first.id, { isActive: false });
    await rulesService.createAutoRuleFromAI('Checking', 'Spotify', 'Entertainment', 'Streaming Services', 0.99);
    expect((await rulesService.getAllRules())).toHaveLength(1);
    expect((await rulesService.applyRules(transaction())).matched).toBe(false);
  });

  it('promotes a corrected suggestion to a user rule that later AI cannot overwrite or delete as AI', async () => {
    const suggestion = await rulesService.createAutoRuleFromAI('Checking', 'Spotify', 'Shopping', undefined, 0.95);
    const corrected = await rulesService.createOrUpdateRuleFromUserEdit('Checking', 'Spotify', 'Entertainment', 'Streaming Services');
    expect(corrected.rule.id).toBe(suggestion.id);
    expect(corrected.rule).toMatchObject({ isActive: true, priority: 25, name: 'User: Spotify (Checking)' });
    await rulesService.createAutoRuleFromAI('Checking', 'Spotify', 'Shopping');
    await rulesService.clearAllRules({ autoGenerated: true });
    expect((await rulesService.applyRules(transaction())).rule?.action.subcategoryName).toBe('Streaming Services');
  });

  it('preserves existing active AI rules on restore for explicit review', async () => {
    const suggestion = await rulesService.createAutoRuleFromAI('Checking', 'Spotify', 'Shopping');
    await rulesService.importRules([{ ...suggestion, isActive: true }]);
    expect((await rulesService.applyRules(transaction())).matched).toBe(true);
  });

  it('retires untouched broad system rules but preserves user-customized ones', async () => {
    const legacy = await rulesService.addRule({
      name: 'Transfer Detection: automatic payment',
      description: 'Auto-generated rule to detect transfer transactions containing "automatic payment"',
      isActive: true, priority: 10,
      conditions: [{ field: 'description', operator: 'contains', value: 'automatic payment', caseSensitive: false }],
      action: { categoryId: 'internal-transfer', categoryName: 'Internal Transfer', transactionType: 'transfer' }
    });
    const customized = await rulesService.addRule({
      ...legacy, name: 'User: my automatic payment', priority: 25,
      conditions: [{ field: 'description', operator: 'equals', value: 'MY AUTOPAY', caseSensitive: false }]
    });
    await transferDetectionService.initializeTransferRules();
    expect((await rulesService.getRuleById(legacy.id))?.isActive).toBe(false);
    expect((await rulesService.getRuleById(customized.id))?.isActive).toBe(true);
    const count = (await rulesService.getAllRules()).length;
    await transferDetectionService.initializeTransferRules();
    expect(await rulesService.getAllRules()).toHaveLength(count);
    for (const description of ['AUTOMATIC PAYMENT SPOTIFY', 'ACH PAYMENT SHELL', 'DIRECT DEPOSIT PAYROLL', 'ZELLE RESTAURANT KREBSEGAA']) {
      expect((await rulesService.applyRules(transaction(description))).matched).toBe(false);
    }
    expect((await rulesService.applyRules(transaction('TRANSFER TO SAVINGS'))).rule?.action.transactionType).toBe('transfer');
    expect((await rulesService.applyRules(transaction('WIRE TRANSFER FEE'))).rule?.action.categoryName).toBe('Financial');
  });
});
