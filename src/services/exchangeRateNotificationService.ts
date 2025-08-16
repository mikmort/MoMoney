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
  private retryAttempts: number = 0;
  private lastRetryTime: Date | null = null;
  private dismissedNotifications: Map<string, Date> = new Map();
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly RETRY_BACKOFF_MS = [5000, 15000, 60000]; // 5s, 15s, 1min
  private readonly DISMISSAL_COOLOFF_HOURS = 6; // Don't show same notification for 6 hours after dismissal

  /**
   * Check exchange rate status and create notifications as needed
   */
  async checkAndCreateNotifications(): Promise<void> {
    const status = currencyExchangeService.getExchangeRateStatus();
    this.lastStatusCheck = new Date();

    // Clear existing notifications
    this.notifications.clear();

    // Don't show any error notifications if rates were updated within 24 hours
    if (status.lastSuccessfulFetch) {
      const hoursSinceLastUpdate = (Date.now() - status.lastSuccessfulFetch.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastUpdate < 24) {
        // Rates are fresh, no notifications needed
        this.retryAttempts = 0; // Reset retry counter on fresh rates
        this.notifyListeners();
        return;
      }
    }

    // For the "no rates" scenario, use retry logic before showing error
    if (!status.hasStoredRates && status.lastSuccessfulFetch === null) {
      // Try to refresh rates with retry logic before showing error
      await this.tryRefreshWithRetry();
      
      // Check status again after retry attempts
      const updatedStatus = currencyExchangeService.getExchangeRateStatus();
      if (!updatedStatus.hasStoredRates && updatedStatus.lastSuccessfulFetch === null) {
        // Only show error notification if still no rates after retries
        if (!this.isNotificationDismissedRecently('no-exchange-rates')) {
          this.createNoRatesNotification(updatedStatus);
        }
      }
    } else if (status.isStale && status.hasStoredRates) {
      // Only show stale warning if rates are more than 24 hours old and not recently dismissed
      if (status.staleDurationHours > 24 && !this.isNotificationDismissedRecently('stale-exchange-rates')) {
        this.createStaleRatesNotification(status);
      }
    } else if (status.staleDurationHours > 72) { // 3 days - critical warning
      if (!this.isNotificationDismissedRecently('very-stale-exchange-rates')) {
        this.createVeryStaleRatesNotification(status);
      }
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
      message: `Unable to retrieve exchange rates after multiple attempts. Foreign currency amounts may not be accurate. This notification will not appear again for ${this.DISMISSAL_COOLOFF_HOURS} hours if dismissed.`,
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
      this.retryAttempts = 0; // Reset retry counter on manual refresh
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
   * Try to refresh exchange rates with exponential backoff retry logic
   */
  private async tryRefreshWithRetry(): Promise<void> {
    if (this.retryAttempts >= this.MAX_RETRY_ATTEMPTS) {
      // Already tried maximum attempts, don't retry again immediately
      const timeSinceLastRetry = this.lastRetryTime ? Date.now() - this.lastRetryTime.getTime() : Infinity;
      if (timeSinceLastRetry < 300000) { // 5 minutes cooloff between retry cycles
        return;
      }
      // Reset after cooloff period
      this.retryAttempts = 0;
    }

    console.log(`Exchange rate retry attempt ${this.retryAttempts + 1}/${this.MAX_RETRY_ATTEMPTS}`);
    this.lastRetryTime = new Date();

    try {
      const testRate = await currencyExchangeService.getExchangeRate('USD', 'EUR');
      if (testRate) {
        console.log('Exchange rate retry successful');
        this.retryAttempts = 0; // Reset on success
        return;
      }
    } catch (error) {
      console.warn(`Exchange rate retry ${this.retryAttempts + 1} failed:`, error);
    }

    this.retryAttempts++;
    
    // If we haven't reached max attempts, schedule next retry
    if (this.retryAttempts < this.MAX_RETRY_ATTEMPTS) {
      const delayMs = this.RETRY_BACKOFF_MS[this.retryAttempts - 1];
      console.log(`Scheduling next retry in ${delayMs}ms`);
      setTimeout(() => {
        this.tryRefreshWithRetry();
      }, delayMs);
    }
  }

  /**
   * Check if a notification was recently dismissed and is still in cooloff period
   */
  private isNotificationDismissedRecently(notificationId: string): boolean {
    const dismissedTime = this.dismissedNotifications.get(notificationId);
    if (!dismissedTime) return false;

    const hoursSinceDismissal = (Date.now() - dismissedTime.getTime()) / (1000 * 60 * 60);
    return hoursSinceDismissal < this.DISMISSAL_COOLOFF_HOURS;
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
      // Track dismissal time for cooloff period
      this.dismissedNotifications.set(notificationId, new Date());
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
    retryAttempts: number;
    lastRetryTime: Date | null;
    dismissedNotifications: Array<{id: string; dismissedAt: Date}>;
    exchangeRateDebug: ReturnType<typeof currencyExchangeService.getDebugInfo>;
  } {
    return {
      notifications: Array.from(this.notifications.values()),
      listenerCount: this.listeners.length,
      lastStatusCheck: this.lastStatusCheck,
      retryAttempts: this.retryAttempts,
      lastRetryTime: this.lastRetryTime,
      dismissedNotifications: Array.from(this.dismissedNotifications.entries()).map(([id, dismissedAt]) => ({
        id,
        dismissedAt
      })),
      exchangeRateDebug: currencyExchangeService.getDebugInfo()
    };
  }
}

// Export singleton instance
export const exchangeRateNotificationService = new ExchangeRateNotificationService();