import { AlertType } from '../components/shared/AlertToast';

interface NotificationHandlers {
  showAlert: (type: AlertType, message: string, title?: string) => void;
  showConfirmation: (message: string, options?: { title?: string; confirmText?: string; cancelText?: string; danger?: boolean }) => Promise<boolean>;
}

class NotificationService {
  private handlers: NotificationHandlers | null = null;

  // Set handlers from React context
  setHandlers(handlers: NotificationHandlers) {
    this.handlers = handlers;
  }

  // Clear handlers (cleanup)
  clearHandlers() {
    this.handlers = null;
  }

  // Show alert - fallback to window.alert if handlers not available
  showAlert(type: AlertType, message: string, title?: string) {
    if (this.handlers) {
      this.handlers.showAlert(type, message, title);
    } else {
      // Fallback for critical system messages before React is initialized
      window.alert(title ? `${title}: ${message}` : message);
    }
  }

  // Show confirmation - fallback to window.confirm if handlers not available  
  async showConfirmation(
    message: string, 
    options?: { title?: string; confirmText?: string; cancelText?: string; danger?: boolean }
  ): Promise<boolean> {
    if (this.handlers) {
      return this.handlers.showConfirmation(message, options);
    } else {
      // Fallback for critical system messages before React is initialized
      const fullMessage = options?.title ? `${options.title}\n\n${message}` : message;
      return window.confirm(fullMessage);
    }
  }
}

// Export singleton instance
export const notificationService = new NotificationService();