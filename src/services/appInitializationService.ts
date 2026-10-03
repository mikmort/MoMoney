export interface InitializationResult {
  success: boolean;
  syncPerformed: boolean;
  autosaveEnabled: boolean;
  errors: string[];
}

class AppInitializationService {
  private initialization: Promise<InitializationResult> | null = null;

  public initialize(): Promise<InitializationResult> {
    if (!this.initialization) this.initialization = this.initializeOnce();
    return this.initialization;
  }

  private async initializeOnce(): Promise<InitializationResult> {
    let syncPerformed = false;
    try {
      const { azureBlobService } = await import('./azureBlobService');
      const available = azureBlobService.isAvailable();
      if (available) syncPerformed = await azureBlobService.loadOnStartup();
      const enabled = available && this.isAutosaveEnabled();
      if (enabled) await azureBlobService.startSync();
      return { success: true, syncPerformed, autosaveEnabled: enabled, errors: [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const { notificationService } = await import('./notificationService');
      notificationService.showAlert('warning', message, 'Cloud sync unavailable');
      return { success: false, syncPerformed, autosaveEnabled: false, errors: [message] };
    }
  }

  public isAutosaveEnabled(): boolean {
    return localStorage.getItem('mo_money_autosave_enabled') === 'true';
  }

  public async toggleAutosave(enabled: boolean): Promise<boolean> {
    const { azureBlobService } = await import('./azureBlobService');
    if (enabled) await azureBlobService.startSync();
    else azureBlobService.stopSync();
    localStorage.setItem('mo_money_autosave_configured', 'true');
    localStorage.setItem('mo_money_autosave_enabled', String(enabled));
    return true;
  }
}

export const appInitializationService = new AppInitializationService();
