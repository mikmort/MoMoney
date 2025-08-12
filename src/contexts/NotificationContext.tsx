import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import AlertToast, { AlertType } from '../components/shared/AlertToast';
import ConfirmationDialog from '../components/shared/ConfirmationDialog';
import { notificationService } from '../services/notificationService';

interface NotificationContextType {
  showAlert: (type: AlertType, message: string, title?: string, options?: AlertOptions) => void;
  showConfirmation: (message: string, options?: ConfirmationOptions) => Promise<boolean>;
}

interface AlertOptions {
  autoClose?: boolean;
  autoCloseDelay?: number;
}

interface ConfirmationOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    type: AlertType;
    message: string;
    title?: string;
    options?: AlertOptions;
  }>({
    isOpen: false,
    type: 'info',
    message: ''
  });

  const [confirmationState, setConfirmationState] = useState<{
    isOpen: boolean;
    message: string;
    options?: ConfirmationOptions;
    resolve?: (value: boolean) => void;
  }>({
    isOpen: false,
    message: ''
  });

  const showAlert = useCallback((
    type: AlertType,
    message: string,
    title?: string,
    options?: AlertOptions
  ) => {
    setAlertState({
      isOpen: true,
      type,
      message,
      title,
      options
    });
  }, []);

  const showConfirmation = useCallback((
    message: string,
    options?: ConfirmationOptions
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmationState({
        isOpen: true,
        message,
        options,
        resolve
      });
    });
  }, []);

  const handleAlertClose = useCallback(() => {
    setAlertState(prev => ({ ...prev, isOpen: false }));
  }, []);

  const handleConfirmationConfirm = useCallback(() => {
    const { resolve } = confirmationState;
    setConfirmationState(prev => ({ ...prev, isOpen: false }));
    if (resolve) {
      resolve(true);
    }
  }, [confirmationState]);

  const handleConfirmationCancel = useCallback(() => {
    const { resolve } = confirmationState;
    setConfirmationState(prev => ({ ...prev, isOpen: false }));
    if (resolve) {
      resolve(false);
    }
  }, [confirmationState]);

  // Register handlers with the global notification service
  useEffect(() => {
    notificationService.setHandlers({ showAlert, showConfirmation });
    
    // Cleanup on unmount
    return () => {
      notificationService.clearHandlers();
    };
  }, [showAlert, showConfirmation]);

  return (
    <NotificationContext.Provider value={{ showAlert, showConfirmation }}>
      {children}
      
      <AlertToast
        isOpen={alertState.isOpen}
        onClose={handleAlertClose}
        type={alertState.type}
        title={alertState.title}
        message={alertState.message}
        autoClose={alertState.options?.autoClose}
        autoCloseDelay={alertState.options?.autoCloseDelay}
      />

      <ConfirmationDialog
        isOpen={confirmationState.isOpen}
        onConfirm={handleConfirmationConfirm}
        onCancel={handleConfirmationCancel}
        title={confirmationState.options?.title}
        message={confirmationState.message}
        confirmText={confirmationState.options?.confirmText}
        cancelText={confirmationState.options?.cancelText}
        danger={confirmationState.options?.danger}
      />
    </NotificationContext.Provider>
  );
};

export const useNotification = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};