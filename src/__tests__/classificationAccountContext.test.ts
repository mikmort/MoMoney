import { FileProcessingService } from '../services/fileProcessingService';
import { accountManagementService } from '../services/accountManagementService';
import { azureOpenAIService } from '../services/azureOpenAIService';
import { rulesService } from '../services/rulesService';
import { transferDetectionService } from '../services/transferDetectionService';
import { userPreferencesService } from '../services/userPreferencesService';
import { defaultCategories } from '../data/defaultCategories';
import { Account, CategoryRule, FileSchemaMapping } from '../types';

jest.mock('../services/azureOpenAIService');

const mapping: FileSchemaMapping = {
  hasHeaders: true, skipRows: 0, dateFormat: 'YYYY-MM-DD', amountFormat: 'decimal',
  dateColumn: 'Date', descriptionColumn: 'Description', amountColumn: 'Amount'
};
const account: Account = {
  id: 'broker-id', name: 'Private Brokerage', type: 'investment', currency: 'USD',
  institution: 'Private Institution', maskedAccountNumber: 'Ending in 123', balance: 123456, isActive: false
};
const result = {
  categoryId: 'asset-allocation', subcategoryId: 'asset-stock-purchase', confidence: 0.95,
  reasoning: 'Stock purchase in an investment account'
};
const suggestion: CategoryRule = {
  id: 'suggestion', name: 'AI suggestion', isActive: false, priority: 50, conditions: [],
  action: { categoryId: 'asset-allocation', categoryName: 'Asset Allocation' },
  createdDate: new Date(), lastModifiedDate: new Date()
};

afterEach(() => jest.restoreAllMocks());

it('looks up inactive account names used by historical transactions', () => {
  const saved = accountManagementService.addAccount(account);
  expect(accountManagementService.getAccounts()).not.toContainEqual(saved);
  expect(accountManagementService.getAccountByName(account.name)).toEqual(saved);
  expect(accountManagementService.getAccountByName('Missing account')).toBeUndefined();
});

it('includes account context in actual batch import requests and preserves asset allocation type', async () => {
  jest.spyOn(accountManagementService, 'getAccount').mockReturnValue(account);
  jest.spyOn(transferDetectionService, 'initializeTransferRules').mockResolvedValue(0);
  jest.spyOn(rulesService, 'getAllRules').mockResolvedValue([]);
  jest.spyOn(rulesService, 'applyRulesToBatch').mockImplementation(async transactions => ({
    matchedTransactions: [], unmatchedTransactions: transactions
  }));
  jest.spyOn(rulesService, 'createAutoRuleFromAI').mockResolvedValue(suggestion);
  jest.mocked(azureOpenAIService.classifyTransactionsBatch).mockResolvedValue([result]);
  const service = new FileProcessingService();
  const rows = await service['processTransactions']('file-id', [{
    Date: '2026-01-15', Description: 'BOUGHT STARBUCKS CORP', Amount: '-2500'
  }], mapping, defaultCategories, [], account.id);
  expect(azureOpenAIService.classifyTransactionsBatch).toHaveBeenCalledWith([{
    transactionText: 'BOUGHT STARBUCKS CORP', amount: -2500,
    date: expect.any(String), availableCategories: defaultCategories,
    accountType: 'investment', currency: 'USD'
  }]);
  expect(rows).toEqual([expect.objectContaining({
    category: 'Asset Allocation', subcategory: 'Stock Purchase', type: 'asset-allocation'
  })]);
});

it('includes account context in the single-row classification path', async () => {
  jest.spyOn(accountManagementService, 'getAccount').mockReturnValue(account);
  jest.spyOn(userPreferencesService, 'getDefaultCurrency').mockResolvedValue('USD');
  jest.spyOn(rulesService, 'applyRules').mockResolvedValue({ matched: false, confidence: 0 });
  jest.spyOn(rulesService, 'createAutoRuleFromAI').mockResolvedValue(suggestion);
  jest.mocked(azureOpenAIService.classifyTransaction).mockResolvedValue(result);
  await new FileProcessingService()['processRow']({
    Date: '2026-01-15', Description: 'BOUGHT STARBUCKS CORP', Amount: '-2500'
  }, mapping, defaultCategories, [], account.id);
  expect(azureOpenAIService.classifyTransaction).toHaveBeenCalledWith({
    transactionText: 'BOUGHT STARBUCKS CORP', amount: -2500,
    date: expect.any(String), availableCategories: defaultCategories,
    accountType: 'investment', currency: 'USD'
  });
});
