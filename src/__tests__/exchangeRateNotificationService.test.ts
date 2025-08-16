import { exchangeRateNotificationService } from '../services/exchangeRateNotificationService';
import { currencyExchangeService } from '../services/currencyExchangeService';

// Mock the currency exchange service
jest.mock('../services/currencyExchangeService');

describe('Exchange Rate Notification Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
    
    // Reset notification service state
    exchangeRateNotificationService.clearAll();
    (exchangeRateNotificationService as any).retryAttempts = 0;
    (exchangeRateNotificationService as any).dismissedNotifications.clear();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('24-hour grace period', () => {
    it('should not show notifications if rates were updated within 24 hours', async () => {
      // Mock status with recent successful fetch
      const recentUpdate = new Date(Date.now() - 1000 * 60 * 60 * 12); // 12 hours ago
      (currencyExchangeService.getExchangeRateStatus as jest.Mock).mockReturnValue({
        isStale: false,
        lastSuccessfulFetch: recentUpdate,
        staleDurationHours: 12,
        hasStoredRates: true,
        totalStoredRates: 5
      });

      await exchangeRateNotificationService.checkAndCreateNotifications();

      const notifications = exchangeRateNotificationService.getNotifications();
      expect(notifications).toHaveLength(0);
    });

    it('should show stale notification only after 24+ hours', async () => {
      // Mock status with old successful fetch
      const oldUpdate = new Date(Date.now() - 1000 * 60 * 60 * 36); // 36 hours ago
      (currencyExchangeService.getExchangeRateStatus as jest.Mock).mockReturnValue({
        isStale: true,
        lastSuccessfulFetch: oldUpdate,
        staleDurationHours: 36,
        hasStoredRates: true,
        totalStoredRates: 5
      });

      await exchangeRateNotificationService.checkAndCreateNotifications();

      const notifications = exchangeRateNotificationService.getNotifications();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].id).toBe('stale-exchange-rates');
      expect(notifications[0].type).toBe('warning');
    });
  });

  describe('retry logic for no rates scenario', () => {
    it('should retry before showing error notification when no rates available', async () => {
      // Mock status with no rates
      (currencyExchangeService.getExchangeRateStatus as jest.Mock)
        .mockReturnValueOnce({
          isStale: true,
          lastSuccessfulFetch: null,
          staleDurationHours: 0,
          hasStoredRates: false,
          totalStoredRates: 0
        })
        .mockReturnValueOnce({
          isStale: true,
          lastSuccessfulFetch: null,
          staleDurationHours: 0,
          hasStoredRates: false,
          totalStoredRates: 0
        });

      // Mock failed exchange rate attempts
      (currencyExchangeService.getExchangeRate as jest.Mock).mockResolvedValue(null);

      await exchangeRateNotificationService.checkAndCreateNotifications();

      // Should have attempted to get exchange rate during retry
      expect(currencyExchangeService.getExchangeRate).toHaveBeenCalledWith('USD', 'EUR');

      const notifications = exchangeRateNotificationService.getNotifications();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].id).toBe('no-exchange-rates');
      expect(notifications[0].message).toContain('after multiple attempts');
    });

    it('should not retry if already at max retry attempts', async () => {
      // Set retry attempts to max
      (exchangeRateNotificationService as any).retryAttempts = 3;
      (exchangeRateNotificationService as any).lastRetryTime = new Date(Date.now() - 1000); // 1 second ago

      (currencyExchangeService.getExchangeRateStatus as jest.Mock).mockReturnValue({
        isStale: true,
        lastSuccessfulFetch: null,
        staleDurationHours: 0,
        hasStoredRates: false,
        totalStoredRates: 0
      });

      await exchangeRateNotificationService.checkAndCreateNotifications();

      // Should not have attempted to get exchange rate (no retry)
      expect(currencyExchangeService.getExchangeRate).not.toHaveBeenCalled();
    });
  });

  describe('dismissal cooloff period', () => {
    it('should not show notification again within cooloff period after dismissal', async () => {
      // Create a notification
      (currencyExchangeService.getExchangeRateStatus as jest.Mock).mockReturnValue({
        isStale: true,
        lastSuccessfulFetch: new Date(Date.now() - 1000 * 60 * 60 * 36), // 36 hours ago
        staleDurationHours: 36,
        hasStoredRates: true,
        totalStoredRates: 5
      });

      await exchangeRateNotificationService.checkAndCreateNotifications();
      let notifications = exchangeRateNotificationService.getNotifications();
      expect(notifications).toHaveLength(1);

      // Dismiss the notification
      exchangeRateNotificationService.dismissNotification('stale-exchange-rates');
      notifications = exchangeRateNotificationService.getNotifications();
      expect(notifications).toHaveLength(0);

      // Check again - should not show the same notification during cooloff
      await exchangeRateNotificationService.checkAndCreateNotifications();
      notifications = exchangeRateNotificationService.getNotifications();
      expect(notifications).toHaveLength(0);

      // Fast-forward past cooloff period (6+ hours)
      const dismissedNotifications = (exchangeRateNotificationService as any).dismissedNotifications;
      dismissedNotifications.set('stale-exchange-rates', new Date(Date.now() - 1000 * 60 * 60 * 7)); // 7 hours ago

      // Should show notification again after cooloff
      await exchangeRateNotificationService.checkAndCreateNotifications();
      notifications = exchangeRateNotificationService.getNotifications();
      expect(notifications).toHaveLength(1);
    });
  });

  describe('debug information', () => {
    it('should include retry and dismissal information in debug output', () => {
      (exchangeRateNotificationService as any).retryAttempts = 2;
      (exchangeRateNotificationService as any).lastRetryTime = new Date('2024-01-01T12:00:00Z');
      (exchangeRateNotificationService as any).dismissedNotifications.set('test-id', new Date('2024-01-01T10:00:00Z'));

      (currencyExchangeService.getDebugInfo as jest.Mock).mockReturnValue({
        consecutiveFailures: 1,
        lastApiCallAttempt: new Date()
      });

      const debugInfo = exchangeRateNotificationService.getDebugInfo();

      expect(debugInfo.retryAttempts).toBe(2);
      expect(debugInfo.lastRetryTime).toEqual(new Date('2024-01-01T12:00:00Z'));
      expect(debugInfo.dismissedNotifications).toHaveLength(1);
      expect(debugInfo.dismissedNotifications[0].id).toBe('test-id');
      expect(debugInfo.dismissedNotifications[0].dismissedAt).toEqual(new Date('2024-01-01T10:00:00Z'));
    });
  });

  describe('manual refresh', () => {
    it('should reset retry counter on manual refresh', async () => {
      (exchangeRateNotificationService as any).retryAttempts = 2;
      (currencyExchangeService.getExchangeRate as jest.Mock).mockResolvedValue({
        fromCurrency: 'USD',
        toCurrency: 'EUR',
        rate: 0.85,
        date: new Date(),
        source: 'api'
      });

      (currencyExchangeService.getExchangeRateStatus as jest.Mock).mockReturnValue({
        isStale: false,
        lastSuccessfulFetch: new Date(),
        staleDurationHours: 0,
        hasStoredRates: true,
        totalStoredRates: 5
      });

      // Trigger manual refresh through action callback
      const notifications = exchangeRateNotificationService.getNotifications();
      // Simulate manual refresh
      await (exchangeRateNotificationService as any).refreshExchangeRates();

      expect((exchangeRateNotificationService as any).retryAttempts).toBe(0);
    });
  });
});