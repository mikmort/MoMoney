import { dataService } from '../services/dataService';
import { db } from '../services/db';

const input = {
  date: new Date('2026-01-01'), description: 'Original', amount: -10,
  category: 'Food', account: 'Checking', type: 'expense' as const
};

describe('local cache data-loss protection', () => {
  beforeEach(async () => {
    await dataService.clearAllData();
  });

  afterEach(() => jest.restoreAllMocks());

  it('cannot overwrite restored records using a stale in-memory cache', async () => {
    await dataService.addTransaction(input);
    await db.transactions.add({ ...input, id: 'imported-in-another-tab' });
    await expect(dataService.addTransaction({ ...input, description: 'New' }))
      .rejects.toThrow('Stored data changed');
    expect(await db.transactions.count()).toBe(2);
    expect(await db.transactions.get('imported-in-another-tab')).toBeDefined();
  });

  it('rolls back the entire save even when only a minority of records fail', async () => {
    await dataService.addTransactions([
      input, { ...input, description: 'Second' }, { ...input, description: 'Third' }
    ]);
    const before = await db.transactions.toArray();
    jest.spyOn(db, 'robustBulkPut').mockResolvedValueOnce({
      successful: 3, failed: 1, errors: ['simulated failed record']
    });
    await expect(dataService.addTransaction({ ...input, description: 'Fourth' }))
      .rejects.toThrow('Save rolled back');
    expect(await db.transactions.toArray()).toEqual(before);
  });
});
