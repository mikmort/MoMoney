import { skipAuthentication } from '../config/devConfig';

interface InitializationResult {
  success: boolean;
  syncPerformed: boolean;
  autosaveEnabled: boolean;
  restored?: boolean;
  errors: string[];
}

export class AppInitializationService {
  private initialization: Promise<InitializationResult> | null = null;

  initialize(): Promise<InitializationResult> {
    if (!this.initialization) this.initialization = this.initializeOnce();
    return this.initialization;
  }

  private async initializeOnce(): Promise<InitializationResult> {
    const result: InitializationResult = {
      success: true, syncPerformed: false, autosaveEnabled: false, errors: []
    };
    if (skipAuthentication) return result;
    try {
      if (localStorage.getItem('mo_money_autosave_configured') !== 'true') {
        localStorage.setItem('mo_money_autosave_configured', 'true');
        localStorage.setItem('mo_money_autosave_enabled', 'true');
      }
      result.autosaveEnabled = this.isAutosaveEnabled();
      if (!result.autosaveEnabled) return result;
      const { azureBlobService } = await import('./azureBlobService');
      const sync = await azureBlobService.synchronize();
      result.success = sync.success;
      result.syncPerformed = sync.success;
      result.restored = sync.restored;
      if (!sync.success) result.errors.push(sync.message);
      if (!sync.restored) await azureBlobService.startSync();
    } catch (error) {
      result.success = false;
      result.errors.push(String(error));
      console.error('[App Init]', error);
    }
    return result;
  }

  public isAutosaveEnabled(): boolean {
    return !skipAuthentication && localStorage.getItem('mo_money_autosave_enabled') === 'true';
  }

  public async toggleAutosave(enabled: boolean): Promise<boolean> {
    if (skipAuthentication) return false;
    try {
      localStorage.setItem('mo_money_autosave_configured', 'true');
      localStorage.setItem('mo_money_autosave_enabled', String(enabled));
      const { azureBlobService } = await import('./azureBlobService');
      if (enabled) {
        const result = await azureBlobService.synchronize();
        if (result.restored) window.location.reload();
        else await azureBlobService.startSync();
        return result.success;
      }
      azureBlobService.stopSync();
      return true;
    } catch (error) {
      console.error('[App Init] Failed to toggle autosave:', error);
      return false;
    }
  }
}

export const appInitializationService = new AppInitializationService();
