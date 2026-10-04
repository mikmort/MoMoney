import { FileProcessingService } from '../services/fileProcessingService';
import { azureOpenAIService } from '../services/azureOpenAIService';
import { rulesService } from '../services/rulesService';
import { detectCSVSchema, parseStatementAmount } from '../utils/csvSchema';
import { defaultCategories } from '../data/defaultCategories';

// Synthetic merchant, dates and amounts reproduce the column layout without
// committing a user's statement contents.
const csv = `Transaction Date,Post Date,Description,Category,Type,Amount,Memo
08/19/2025,08/21/2025,12345 EXAMPLE RESTAURANT,Food & Drink,Sale,-15.25,
08/28/2025,08/30/2025,12345 EXAMPLE RESTAURANT,Food & Drink,Sale,-18.75,`;

afterEach(async () => {
  jest.restoreAllMocks();
  await rulesService.clearAllRules();
});

it('uses transaction date, merchant description and signed amount from Chase headers without asking AI', async () => {
  const schemaAI = jest.spyOn(azureOpenAIService, 'makeRequest').mockRejectedValue(new Error('AI unavailable'));
  jest.spyOn(azureOpenAIService, 'classifyTransactionsBatch').mockImplementation(async requests => requests.map(() => ({
    categoryId: 'uncategorized', confidence: 0.1, reasoning: 'AI unavailable',
    error: { code: 'unavailable', message: 'AI unavailable' }
  })));
  const service = new FileProcessingService();
  const { mapping } = await service['getAISchemaMapping'](csv, 'csv');
  expect(mapping).toMatchObject({ dateColumn: 'Transaction Date', descriptionColumn: 'Description', amountColumn: 'Amount' });
  expect(schemaAI).not.toHaveBeenCalled();
  const rows = await service['parseCSV'](csv, mapping);
  const transactions = await service['processTransactions'](
    'synthetic-chase', rows, mapping, defaultCategories, [], 'test-checking'
  );
  expect(transactions).toHaveLength(2);
  expect(transactions.map(row => [row.description, row.amount, row.date.getDate()])).toEqual([
    ['12345 EXAMPLE RESTAURANT', -15.25, 19], ['12345 EXAMPLE RESTAURANT', -18.75, 28]
  ]);
});

it('does not parse a numeric merchant prefix or a posting date as money', () => {
  expect(parseStatementAmount('12345 EXAMPLE RESTAURANT')).toBeNull();
  expect(parseStatementAmount('08/21/2025')).toBeNull();
  expect(parseStatementAmount('123.45 unexpected text')).toBeNull();
});

it.each([
  ['$1,234.56', 1234.56], ['-15.25', -15.25], ['(15.25)', -15.25],
  ['500.000,00', 500000], ['1,234', 1234], ['15,25', 15.25], [0, 0], ['0.00', 0]
])('accepts complete supported amount %s', (input, expected) => {
  expect(parseStatementAmount(input)).toBe(expected);
});

it('maps reordered and case-varied headers instead of relying on positions', () => {
  expect(detectCSVSchema(' Memo ,AMOUNT, description ,Post Date,Transaction Date\n,-8.00,Example,08/22/2025,08/20/2025')).toMatchObject({
    dateColumn: 'Transaction Date', descriptionColumn: ' description ', amountColumn: 'AMOUNT', notesColumn: ' Memo '
  });
});

it('retains split debit/credit and withdrawal/deposit mappings', () => {
  expect(detectCSVSchema('Date,Description,Debit,Credit\n08/20/2025,Example,12,')).toMatchObject({ amountColumn: 'Debit/Credit' });
  expect(detectCSVSchema('Date,Description,Withdrawal,Deposit\n08/20/2025,Example,12,')).toMatchObject({ amountColumn: 'Withdrawal/Deposit' });
});

it('does not guess positional CSV columns after schema analysis fails', async () => {
  jest.spyOn(azureOpenAIService, 'makeRequest').mockRejectedValue(new Error('AI unavailable'));
  await expect(new FileProcessingService()['getAISchemaMapping'](
    'Unknown A,Unknown B,Unknown C\n08/19/2025,08/21/2025,12345 EXAMPLE RESTAURANT', 'csv'
  )).rejects.toThrow('positional guessing was not applied');
});
