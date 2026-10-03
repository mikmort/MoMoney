import { AppInitializationService } from '../services/appInitializationService';
import { azureBlobService } from '../services/azureBlobService';

jest.mock('../config/devConfig', () => ({ skipAuthentication: false }));
jest.mock('../services/azureBlobService', () => ({
  azureBlobService: {
    synchronize: jest.fn(), startSync: jest.fn(), stopSync: jest.fn()
  }
}));

describe('safe cloud startup', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    (azureBlobService.synchronize as jest.Mock).mockResolvedValue({ success: true });
  });

  it('does not download or start a timer when autosave is explicitly disabled', async () => {
    localStorage.setItem('mo_money_autosave_configured', 'true');
    localStorage.setItem('mo_money_autosave_enabled', 'false');
    expect((await new AppInitializationService().initialize()).autosaveEnabled).toBe(false);
    expect(azureBlobService.synchronize).not.toHaveBeenCalled();
    expect(azureBlobService.startSync).not.toHaveBeenCalled();
  });

  it('waits for reconciliation before starting the periodic timer', async () => {
    const service = new AppInitializationService();
    const first = service.initialize();
    expect(service.initialize()).toBe(first);
    await first;
    const syncOrder = (azureBlobService.synchronize as jest.Mock).mock.invocationCallOrder[0];
    const timerOrder = (azureBlobService.startSync as jest.Mock).mock.invocationCallOrder[0];
    expect(syncOrder).toBeLessThan(timerOrder);
    expect(azureBlobService.synchronize).toHaveBeenCalledTimes(1);
  });

  it('reports initial sync failures instead of declaring success', async () => {
    (azureBlobService.synchronize as jest.Mock).mockResolvedValue({ success: false, message: 'Cloud unavailable' });
    expect(await new AppInitializationService().initialize()).toMatchObject({
      success: false, syncPerformed: false, errors: ['Cloud unavailable']
    });
  });

  it('does not start uploading before a restored page reloads', async () => {
    (azureBlobService.synchronize as jest.Mock).mockResolvedValue({ success: true, restored: true });
    expect((await new AppInitializationService().initialize()).restored).toBe(true);
    expect(azureBlobService.startSync).not.toHaveBeenCalled();
  });
});
