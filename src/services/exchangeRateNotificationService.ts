import { currencyExchangeService, ExchangeRateStatus } from './currencyExchangeService';

export interface ExchangeRateNotification {
  id: string;
  type: 'warning' | 'error' | 'info';
  title: string;
  message: string;
  isVisible: boolean;
  canDismiss: boolean;
  actionText?: string;
  actionCallback?: () => void;
}

class ExchangeRateNotificationService {
  private notifications: Map<string, ExchangeRateNotification> = new Map();
  private listeners: Array<(notifications: ExchangeRateNotification[]) => void> = [];
  private lastStatusCheck: Date | null = null;

  /**
   * Check exchange rate status and create notifications as needed
   */
  async checkAndCreateNotifications(): Promise<void> {
    const status = currencyExchangeService.getExchangeRateStatus();
    this.lastStatusCheck = new Date();

    // Clear existing notifications
    this.notifications.clear();

    // Create notifications based on status
    if (status.isStale && status.hasStoredRates) {
      this.createStaleRatesNotification(status);
    } else if (!status.hasStoredRates && status.lastSuccessfulFetch === null) {
      this.createNoRatesNotification(status);
    } else if (status.staleDurationHours > 72) { // 3 days
      this.createVeryStaleRatesNotification(status);
    }

    this.notifyListeners();
  }

  private createStaleRatesNotification(status: ExchangeRateStatus): void {
    const notification: ExchangeRateNotification = {
      id: 'stale-exchange-rates',
      type: 'warning',
      title: 'Exchange Rates May Be Outdated',
      message: `Exchange rates were last updated ${Math.floor(status.staleDurationHours)} hours ago. Foreign currency amounts may not reflect current exchange rates.`,
      isVisible: true,
      canDismiss: true,
      actionText: 'Refresh Rates',
      actionCallback: () => this.refreshExchangeRates()
    };

    this.notifications.set(notification.id, notification);
  }

  private createNoRatesNotification(status: ExchangeRateStatus): void {
    const notification: ExchangeRateNotification = {
      id: 'no-exchange-rates',
      type: 'error',
      title: 'Exchange Rate Service Unavailable',
      message: 'Unable to retrieve exchange rates for foreign currency conversions. Foreign currency amounts may not be accurate.',
      isVisible: true,
      canDismiss: true,
      actionText: 'Try Again',
      actionCallback: () => this.refreshExchangeRates()
    };

    this.notifications.set(notification.id, notification);
  }

  private createVeryStaleRatesNotification(status: ExchangeRateStatus): void {
    const daysSinceUpdate = Math.floor(status.staleDurationHours / 24);
    const notification: ExchangeRateNotification = {
      id: 'very-stale-exchange-rates',
      type: 'error',
      title: 'Exchange Rates Significantly Outdated',
      message: `Exchange rates are ${daysSinceUpdate} days old. Currency conversions may be significantly inaccurate.`,
      isVisible: true,
      canDismiss: false, // Don't allow dismissing critical warnings
      actionText: 'Update Now',
      actionCallback: () => this.refreshExchangeRates()
    };

    this.notifications.set(notification.id, notification);
  }

  private async refreshExchangeRates(): Promise<void> {
    // Try to fetch a common exchange rate to test connectivity
    try {
      console.log('Attempting to refresh exchange rates...');
      const testRate = await currencyExchangeService.getExchangeRate('USD', 'EUR');
      if (testRate) {
        console.log('Exchange rate refresh successful');
        // Recheck notifications after successful refresh
        await this.checkAndCreateNotifications();
      } else {
        console.warn('Exchange rate refresh failed');
      }
    } catch (error) {
      console.error('Failed to refresh exchange rates:', error);
    }
  }

  /**
   * Subscribe to notification updates
   */
  subscribe(callback: (notifications: ExchangeRateNotification[]) => void): () => void {
    this.listeners.push(callback);
    
    // Immediately send current notifications
    callback(Array.from(this.notifications.values()));

    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter(listener => listener !== callback);
    };
  }

  /**
   * Dismiss a notification
   */
  dismissNotification(notificationId: string): void {
    const notification = this.notifications.get(notificationId);
    if (notification && notification.canDismiss) {
      this.notifications.delete(notificationId);
      this.notifyListeners();
    }
  }

  /**
   * Get all current notifications
   */
  getNotifications(): ExchangeRateNotification[] {
    return Array.from(this.notifications.values());
  }

  /**
   * Clear all notifications
   */
  clearAll(): void {
    this.notifications.clear();
    this.notifyListeners();
  }

  /**
   * Initialize service (should be called on app startup)
   */
  async initialize(): Promise<void> {
    await this.checkAndCreateNotifications();
    
    // Set up periodic checking (every 30 minutes)
    setInterval(() => {
      this.checkAndCreateNotifications();
    }, 30 * 60 * 1000);
  }

  private notifyListeners(): void {
    const notifications = Array.from(this.notifications.values());
    this.listeners.forEach(callback => callback(notifications));
  }

  /**
   * Get debug information
   */
  getDebugInfo(): {
    notifications: ExchangeRateNotification[];
    listenerCount: number;
    lastStatusCheck: Date | null;
    exchangeRateDebug: ReturnType<typeof currencyExchangeService.getDebugInfo>;
  } {
    return {
      notifications: Array.from(this.notifications.values()),
      listenerCount: this.listeners.length,
      lastStatusCheck: this.lastStatusCheck,
      exchangeRateDebug: currencyExchangeService.getDebugInfo()
    };
  }
}

// Export singleton instance
export const exchangeRateNotificationService = new ExchangeRateNotificationService();