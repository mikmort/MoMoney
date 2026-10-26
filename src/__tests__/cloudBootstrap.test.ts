import { db } from '../services/db';
import { userPreferencesService } from '../services/userPreferencesService';

afterAll(() => db.close());

test('displaying default preferences does not create unsent edits or invalidate a reconciliation preview', async () => {
  await db.open();
  await db.userPreferences.clear();
  const preferences = await userPreferencesService.getPreferences();
  expect(preferences.currency).toBe('USD');
  expect(await db.userPreferences.count()).toBe(0);
  await userPreferencesService.updatePreferences({ currency: 'EUR' });
  expect((await db.getUserPreferences())?.currency).toBe('EUR');
});
