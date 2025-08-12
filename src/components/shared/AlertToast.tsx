import React, { useEffect } from 'react';
import styled, { keyframes } from 'styled-components';

export type AlertType = 'success' | 'error' | 'info' | 'warning';

interface AlertToastProps {
  isOpen: boolean;
  onClose: () => void;
  type: AlertType;
  title?: string;
  message: string;
  autoClose?: boolean;
  autoCloseDelay?: number;
}

const slideInFromTop = keyframes`
  from {
    opacity: 0;
    transform: translateY(-100%);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  pointer-events: none;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 20px;
`;

const ToastContainer = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'alertType',
})<{ alertType: AlertType }>`
  background: white;
  border-radius: 8px;
  padding: 16px 20px;
  margin: 0 20px;
  max-width: 500px;
  min-width: 300px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  border-left: 4px solid ${props => {
    switch (props.alertType) {
      case 'success': return '#4caf50';
      case 'error': return '#f44336';
      case 'warning': return '#ff9800';
      case 'info':
      default: return '#2196f3';
    }
  }};
  animation: ${slideInFromTop} 0.3s ease-out;
  pointer-events: auto;
  position: relative;
`;

const ToastHeader = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'hasTitle',
})<{ hasTitle?: boolean }>`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: ${props => props.hasTitle ? '8px' : '0'};
`;

const ToastTitle = styled.h3.withConfig({
  shouldForwardProp: (prop) => prop !== 'alertType',
})<{ alertType: AlertType }>`
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: ${props => {
    switch (props.alertType) {
      case 'success': return '#2e7d32';
      case 'error': return '#c62828';
      case 'warning': return '#ef6c00';
      case 'info':
      default: return '#1976d2';
    }
  }};
  display: flex;
  align-items: center;
  gap: 8px;

  &:before {
    content: '${props => {
      switch (props.alertType) {
        case 'success': return '✅';
        case 'error': return '❌';
        case 'warning': return '⚠️';
        case 'info':
        default: return 'ℹ️';
      }
    }}';
  }
`;

const ToastMessage = styled.p`
  margin: 0;
  color: #333;
  line-height: 1.4;
  white-space: pre-wrap;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 18px;
  color: #666;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  margin-left: 12px;
  flex-shrink: 0;
  
  &:hover {
    color: #333;
  }
`;

export const AlertToast: React.FC<AlertToastProps> = ({
  isOpen,
  onClose,
  type,
  title,
  message,
  autoClose = true,
  autoCloseDelay = 5000
}) => {
  useEffect(() => {
    if (isOpen && autoClose) {
      const timer = setTimeout(() => {
        onClose();
      }, autoCloseDelay);

      return () => clearTimeout(timer);
    }
  }, [isOpen, autoClose, autoCloseDelay, onClose]);

  if (!isOpen) return null;

  return (
    <Overlay>
      <ToastContainer alertType={type}>
        <ToastHeader hasTitle={!!title}>
          {title && <ToastTitle alertType={type}>{title}</ToastTitle>}
          <CloseButton onClick={onClose}>×</CloseButton>
        </ToastHeader>
        <ToastMessage>{message}</ToastMessage>
      </ToastContainer>
    </Overlay>
  );
};

export default AlertToast;