interface InitializationResult {
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
    try {
      const { azureBlobService } = await import('./azureBlobService');
      const enabled = azureBlobService.isAvailable();
      if (enabled) await azureBlobService.startSync();
      return { success: true, syncPerformed: enabled, autosaveEnabled: enabled, errors: [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const { notificationService } = await import('./notificationService');
      notificationService.showAlert('warning', message, 'Cloud sync unavailable');
      return { success: false, syncPerformed: false, autosaveEnabled: false, errors: [message] };
    }
  }
}

export const appInitializationService = new AppInitializationService();
