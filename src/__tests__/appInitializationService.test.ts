export {};

const mockStartSync = jest.fn();
const mockIsAvailable = jest.fn();
const mockShowAlert = jest.fn();
jest.mock('../services/azureBlobService', () => ({
  azureBlobService: { startSync: mockStartSync, isAvailable: mockIsAvailable }
}));
jest.mock('../services/notificationService', () => ({ notificationService: { showAlert: mockShowAlert } }));

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  localStorage.clear();
  mockIsAvailable.mockReturnValue(true);
  mockStartSync.mockResolvedValue(undefined);
});

test('first signed-in launch starts automatic reconciliation without an opt-in', async () => {
  const { appInitializationService } = await import('../services/appInitializationService');
  expect(await appInitializationService.initialize()).toMatchObject({ success: true, autosaveEnabled: true, syncPerformed: true });
  expect(mockStartSync).toHaveBeenCalledTimes(1);
});

test('old disabled preferences do not prevent automatic reconciliation; concurrent startup shares one promise', async () => {
  localStorage.setItem('mo_money_autosave_enabled', 'false');
  const { appInitializationService } = await import('../services/appInitializationService');
  const first = appInitializationService.initialize();
  expect(appInitializationService.initialize()).toBe(first);
  await first;
  expect(mockStartSync).toHaveBeenCalledTimes(1);
});

test('development mode never starts cloud sync', async () => {
  mockIsAvailable.mockReturnValue(false);
  const { appInitializationService } = await import('../services/appInitializationService');
  expect(await appInitializationService.initialize()).toMatchObject({ success: true, autosaveEnabled: false });
  expect(mockStartSync).not.toHaveBeenCalled();
});

test('startup failures are surfaced instead of enabling editing over another tab', async () => {
  mockStartSync.mockRejectedValue(new Error('Another tab is editing'));
  const { appInitializationService } = await import('../services/appInitializationService');
  expect(await appInitializationService.initialize()).toMatchObject({ success: false, errors: ['Another tab is editing'] });
  expect(mockShowAlert).toHaveBeenCalled();
});
