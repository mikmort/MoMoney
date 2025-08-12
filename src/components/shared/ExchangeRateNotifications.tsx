import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { exchangeRateNotificationService, ExchangeRateNotification } from '../../services/exchangeRateNotificationService';

const NotificationContainer = styled.div`
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 1000;
  max-width: 400px;
`;

const NotificationCard = styled.div<{ type: 'warning' | 'error' | 'info' }>`
  background: ${props => 
    props.type === 'error' ? '#fee2e2' :
    props.type === 'warning' ? '#fef3c7' : '#dbeafe'
  };
  border: 1px solid ${props => 
    props.type === 'error' ? '#fecaca' :
    props.type === 'warning' ? '#fde68a' : '#bfdbfe'
  };
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  position: relative;
  animation: slideIn 0.3s ease-out;

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(100%);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
`;

const NotificationIcon = styled.div<{ type: 'warning' | 'error' | 'info' }>`
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: inline-block;
  margin-right: 8px;
  background: ${props => 
    props.type === 'error' ? '#ef4444' :
    props.type === 'warning' ? '#f59e0b' : '#3b82f6'
  };
  flex-shrink: 0;
  
  &::after {
    content: ${props => 
      props.type === 'error' ? '"×"' :
      props.type === 'warning' ? '"!"' : '"i"'
    };
    color: white;
    display: block;
    text-align: center;
    line-height: 20px;
    font-weight: bold;
    font-size: 12px;
  }
`;

const NotificationHeader = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 8px;
`;

const NotificationTitle = styled.h4`
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
`;

const NotificationMessage = styled.p`
  margin: 0 0 12px 0;
  font-size: 13px;
  color: #4b5563;
  line-height: 1.4;
`;

const NotificationActions = styled.div`
  display: flex;
  gap: 8px;
  justify-content: flex-end;
`;

const NotificationButton = styled.button`
  background: transparent;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 4px 12px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #f9fafb;
  }

  &.primary {
    background: #3b82f6;
    border-color: #3b82f6;
    color: white;

    &:hover {
      background: #2563eb;
    }
  }
`;

const DismissButton = styled.button`
  position: absolute;
  top: 8px;
  right: 8px;
  background: transparent;
  border: none;
  color: #6b7280;
  cursor: pointer;
  padding: 4px;
  line-height: 1;
  font-size: 16px;

  &:hover {
    color: #374151;
  }
`;

const ExchangeRateNotifications: React.FC = () => {
  const [notifications, setNotifications] = useState<ExchangeRateNotification[]>([]);

  useEffect(() => {
    // Subscribe to notifications
    const unsubscribe = exchangeRateNotificationService.subscribe(setNotifications);

    // Initialize the notification service
    exchangeRateNotificationService.initialize();

    return unsubscribe;
  }, []);

  const handleDismiss = (notificationId: string) => {
    exchangeRateNotificationService.dismissNotification(notificationId);
  };

  const handleAction = (notification: ExchangeRateNotification) => {
    if (notification.actionCallback) {
      notification.actionCallback();
    }
  };

  if (notifications.length === 0) {
    return null;
  }

  return (
    <NotificationContainer>
      {notifications.map(notification => (
        <NotificationCard key={notification.id} type={notification.type}>
          {notification.canDismiss && (
            <DismissButton
              onClick={() => handleDismiss(notification.id)}
              title="Dismiss notification"
            >
              ×
            </DismissButton>
          )}
          
          <NotificationHeader>
            <NotificationIcon type={notification.type} />
            <NotificationTitle>{notification.title}</NotificationTitle>
          </NotificationHeader>
          
          <NotificationMessage>{notification.message}</NotificationMessage>
          
          <NotificationActions>
            {notification.canDismiss && (
              <NotificationButton onClick={() => handleDismiss(notification.id)}>
                Dismiss
              </NotificationButton>
            )}
            {notification.actionText && notification.actionCallback && (
              <NotificationButton
                className="primary"
                onClick={() => handleAction(notification)}
              >
                {notification.actionText}
              </NotificationButton>
            )}
          </NotificationActions>
        </NotificationCard>
      ))}
    </NotificationContainer>
  );
};

export default ExchangeRateNotifications;