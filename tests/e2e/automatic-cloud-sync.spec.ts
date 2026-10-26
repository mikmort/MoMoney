import { test, expect, BrowserContext } from '@playwright/test';
import { CloudSnapshot, CloudVersion, removedRecords } from '../../src/utils/cloudSnapshot';

test.use({ baseURL: process.env.SYNC_TEST_URL });
test.skip(!process.env.SYNC_TEST_URL, 'Set SYNC_TEST_URL to an auth-enabled local build; all authentication and cloud APIs are mocked.');

function snapshot(id = 'cloud-transaction'): CloudSnapshot {
  return {
    schemaVersion: 1,
    transactions: [{ id, date: '2026-03-01T00:00:00.000Z', amount: -25, description: id, category: 'Food & Dining', account: 'Checking', type: 'expense' }],
    transactionHistory: [],
    preferences: [{ id: 'default', currency: 'USD', dateFormat: 'MM/dd/yyyy', theme: 'light', showInvestments: false }],
    storage: {
      'mo-money-accounts': JSON.stringify([{ id: 'checking', name: 'Checking', institution: 'Test Bank', currency: 'USD', type: 'checking', isActive: true, balance: 0 }]),
      'mo-money-categories': null, 'mo-money-category-rules': null, 'mo-money-budgets': '[]', 'mo-money-templates': '[]'
    }
  };
}

async function mockCloud(context: BrowserContext) {
  const state = {
    current: { revision: 'first', parent: null, createdAt: '2026-10-01T00:00:00Z', data: snapshot() } as CloudVersion,
    writes: 0, offline: false
  };
  await context.route('**/.auth/me', route => route.fulfill({ json: {
    clientPrincipal: { userDetails: 'Sync Test User', userId: 'test-user', identityProvider: 'aad', userRoles: ['authenticated'], claims: [] }
  } }));
  await context.route('**/api/storage/current', async route => {
    if (state.offline) { await route.abort('failed'); return; }
    const headers = { 'X-MoMoney-Storage': '1' };
    if (route.request().method() === 'GET') {
      await route.fulfill({ headers, json: { account: 'test-user', current: state.current } });
      return;
    }
    const body = route.request().postDataJSON();
    if (body.expectedRevision !== state.current.revision) {
      await route.fulfill({ status: 409, headers, json: { error: 'Cloud data changed.' } });
      return;
    }
    if (removedRecords(state.current.data, body.data) && !body.allowRemoval) {
      await route.fulfill({ status: 422, headers, json: { error: 'Removal was not approved.' } });
      return;
    }
    state.writes++;
    state.current = { revision: `saved-${state.writes}`, parent: state.current.revision, createdAt: new Date().toISOString(), data: body.data };
    await route.fulfill({ headers, json: state.current });
  });
  await context.route('**/api/openai**', route => route.fulfill({ json: { model: 'test', configured: false } }));
  return state;
}

test('fresh signed-in browser automatically loads cloud data even with the old toggle off', async ({ page, context }) => {
  const state = await mockCloud(context);
  await context.addInitScript(() => localStorage.setItem('mo_money_autosave_enabled', 'false'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Saved to cloud', exact: true })).toBeVisible();
  await expect(page.getByText('cloud-transaction', { exact: true })).toBeVisible();
  expect(state.writes).toBe(0);
});

test('existing unrelated local data gets an explicit merge preview and neither copy is discarded', async ({ page, context }) => {
  const state = await mockCloud(context);
  const local = snapshot('local-transaction');
  await context.addInitScript(data => {
    localStorage.setItem('mo-money-transactions', JSON.stringify(data.transactions));
    localStorage.setItem('mo-money-accounts', data.storage['mo-money-accounts']!);
  }, local);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Link this device safely' })).toBeVisible();
  await expect(page.getByText(/After reconciliation: 2/)).toBeVisible();
  expect(state.writes).toBe(0);
  await page.getByRole('button', { name: 'Apply reconciliation' }).click();
  await expect.poll(() => state.current.data.transactions.length).toBe(2);
  await expect(page.getByRole('link', { name: 'Saved to cloud', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: 'Saved to cloud', exact: true })).toBeVisible();
  expect(state.current.data.transactions.map(row => row.id).sort()).toEqual(['cloud-transaction', 'local-transaction']);
});

test('offline local edits retry automatically and only show saved after cloud acknowledgement', async ({ page, context }) => {
  const state = await mockCloud(context);
  await page.goto('/settings');
  await expect(page.getByRole('link', { name: 'Saved to cloud', exact: true })).toBeVisible();
  state.offline = true;
  await page.locator('select').first().selectOption('EUR');
  await page.getByRole('button', { name: /Save Preferences/ }).click();
  await expect(page.getByRole('link', { name: /Changes saved on this device/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Failed to fetch|NetworkError|offline/i })).toBeVisible({ timeout: 10000 });
  expect(state.current.data.preferences[0].currency).toBe('USD');
  state.offline = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => state.current.data.preferences[0].currency).toBe('EUR');
  await expect(page.getByRole('link', { name: 'Saved to cloud', exact: true })).toBeVisible();
});

test('another tab cannot edit the same browser database through stale caches', async ({ page, context }) => {
  await mockCloud(context);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Saved to cloud', exact: true })).toBeVisible();
  const other = await context.newPage();
  await other.goto('/');
  await expect(other.getByText(/already open in another tab/).first()).toBeVisible();
  await expect(other.getByRole('heading', { name: 'Dashboard', exact: true })).not.toBeVisible();
});

test('sample data remains usable with automatic sync and visible save status', async ({ page, context }, testInfo) => {
  const state = await mockCloud(context);
  await page.goto('/settings');
  await expect(page.getByRole('link', { name: 'Saved to cloud', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Load Sample Data/ }).click();
  await Promise.all([
    page.waitForEvent('framenavigated', frame => frame === page.mainFrame()),
    page.getByRole('button', { name: 'Load Sample Data', exact: true }).click()
  ]);
  await expect.poll(() => state.current.data.transactions.length, { timeout: 20000 }).toBeGreaterThan(1);
  await page.getByRole('link', { name: /Dashboard/ }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Saved to cloud', exact: true })).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: testInfo.outputPath('automatic-sync-dashboard.png'), fullPage: true });
});
