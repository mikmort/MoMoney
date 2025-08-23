import { dataService } from '../services/dataService';
import { reportsService } from '../services/reportsService';

describe('ReportsService user-added category inclusion', () => {
  it('includes a user-created expense category when explicitly filtered', async () => {
    // Arrange: add a transaction with a custom category not in defaultCategories
    const customCategory = 'Work Reimbursed';
    const amount = -50; // expense style (negative)
    await dataService.addTransaction({
      date: new Date(),
      description: 'Client lunch awaiting reimbursement',
      category: customCategory,
      subcategory: 'Meals',
      amount,
      account: 'Chase Checking',
      type: 'expense',
      confidence: 0.9,
      reasoning: 'Test custom category',
      isVerified: true
    });

    // Act: request spending by category filtered to the custom category only
    const results = await reportsService.getSpendingByCategory({ selectedCategories: [customCategory] });

    // Assert: the custom category should be present with positive flipped amount
    const entry = results.find(r => r.categoryName === customCategory);
    expect(entry).toBeTruthy();
    expect(entry!.amount).toBeGreaterThan(0); // should have flipped sign
    expect(Math.round(entry!.amount)).toBe(Math.round(Math.abs(amount))); // amount should match absolute value
  });
});
