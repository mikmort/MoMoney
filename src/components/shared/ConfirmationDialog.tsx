import React from 'react';
import styled from 'styled-components';
import { Button } from '../../styles/globalStyles';

interface ConfirmationDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
`;

const DialogContainer = styled.div`
  background: white;
  border-radius: 8px;
  padding: 24px;
  max-width: 500px;
  width: 90%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  position: relative;
`;

const DialogTitle = styled.h3`
  margin: 0 0 16px 0;
  color: #333;
  font-size: 1.3rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;

  &:before {
    content: '❓';
  }
`;

const DialogMessage = styled.p`
  margin: 0 0 24px 0;
  color: #555;
  line-height: 1.5;
  white-space: pre-wrap;
`;

const DialogActions = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
`;

const ConfirmButton = styled(Button).withConfig({
  shouldForwardProp: (prop) => prop !== 'danger',
})<{ danger?: boolean }>`
  background: ${props => props.danger ? '#f44336' : '#2196f3'};
  color: white;
  border: 1px solid ${props => props.danger ? '#f44336' : '#2196f3'};

  &:hover {
    background: ${props => props.danger ? '#d32f2f' : '#1976d2'};
    border-color: ${props => props.danger ? '#d32f2f' : '#1976d2'};
  }
`;

const CancelButton = styled(Button)`
  background: white;
  color: #666;
  border: 1px solid #ddd;

  &:hover {
    background: #f5f5f5;
    border-color: #ccc;
  }
`;

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  title = 'Confirm Action',
  message,
  confirmText = 'Yes',
  cancelText = 'Cancel',
  danger = false
}) => {
  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onConfirm();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <Overlay onClick={handleOverlayClick} onKeyDown={handleKeyDown} tabIndex={-1}>
      <DialogContainer>
        <DialogTitle>{title}</DialogTitle>
        <DialogMessage>{message}</DialogMessage>
        <DialogActions>
          <CancelButton onClick={onCancel}>{cancelText}</CancelButton>
          <ConfirmButton danger={danger} onClick={onConfirm}>
            {confirmText}
          </ConfirmButton>
        </DialogActions>
      </DialogContainer>
    </Overlay>
  );
};

export default ConfirmationDialog;