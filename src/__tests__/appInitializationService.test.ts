export {};

const mockStartSync = jest.fn();
const mockStopSync = jest.fn();
const mockIsAvailable = jest.fn();
const mockShowAlert = jest.fn();
jest.mock('../services/azureBlobService', () => ({
  azureBlobService: { startSync: mockStartSync, stopSync: mockStopSync, isAvailable: mockIsAvailable }
}));
jest.mock('../services/notificationService', () => ({
  notificationService: { showAlert: mockShowAlert }
}));

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  localStorage.clear();
  mockIsAvailable.mockReturnValue(true);
  mockStartSync.mockResolvedValue(undefined);
});

test('first launch does not opt into cloud uploads or download over local data', async () => {
  const { appInitializationService } = await import('../services/appInitializationService');
  const result = await appInitializationService.initialize();
  expect(result).toMatchObject({ success: true, autosaveEnabled: false, syncPerformed: false });
  expect(mockStartSync).not.toHaveBeenCalled();
});

test('concurrent startup calls share initialization and respect a disabled preference', async () => {
  localStorage.setItem('mo_money_autosave_enabled', 'false');
  const { appInitializationService } = await import('../services/appInitializationService');
  const first = appInitializationService.initialize();
  expect(appInitializationService.initialize()).toBe(first);
  await first;
  expect(mockStartSync).not.toHaveBeenCalled();
});

test('previously enabled sync remains off when cloud is unavailable in local development', async () => {
  localStorage.setItem('mo_money_autosave_enabled', 'true');
  mockIsAvailable.mockReturnValue(false);
  const { appInitializationService } = await import('../services/appInitializationService');
  expect((await appInitializationService.initialize()).autosaveEnabled).toBe(false);
  expect(mockStartSync).not.toHaveBeenCalled();
});

test('startup starts the single guarded service rather than a competing upload/download path', async () => {
  localStorage.setItem('mo_money_autosave_enabled', 'true');
  const { appInitializationService } = await import('../services/appInitializationService');
  expect((await appInitializationService.initialize()).autosaveEnabled).toBe(true);
  expect(mockStartSync).toHaveBeenCalledTimes(1);
});

test('connection failures are surfaced and enabling does not claim success', async () => {
  localStorage.setItem('mo_money_autosave_enabled', 'true');
  mockStartSync.mockRejectedValue(new Error('offline'));
  const { appInitializationService } = await import('../services/appInitializationService');
  const result = await appInitializationService.initialize();
  expect(result).toMatchObject({ success: false, autosaveEnabled: false, errors: ['offline'] });
  expect(mockShowAlert).toHaveBeenCalled();
  localStorage.setItem('mo_money_autosave_enabled', 'false');
  await expect(appInitializationService.toggleAutosave(true)).rejects.toThrow('offline');
  expect(localStorage.getItem('mo_money_autosave_enabled')).toBe('false');
});
