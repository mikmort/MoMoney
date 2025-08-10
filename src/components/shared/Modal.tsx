import React, { ReactNode } from 'react';
import styled from 'styled-components';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  width?: string;
  maxWidth?: string;
  maxHeight?: string;
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

const ModalContent = styled.div.withConfig({
  shouldForwardProp: (prop) => !['width', 'maxWidth', 'maxHeight'].includes(prop),
})<{ width?: string; maxWidth?: string; maxHeight?: string }>`
  background: white;
  border-radius: 8px;
  padding: 24px;
  width: ${props => props.width || '90%'};
  max-width: ${props => props.maxWidth || '600px'};
  max-height: ${props => props.maxHeight || '80vh'};
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  position: relative;
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
`;

const ModalTitle = styled.h2`
  margin: 0;
  color: #333;
  font-size: 1.5rem;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 24px;
  color: #666;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  
  &:hover {
    color: #333;
  }
`;

export const Modal: React.FC<ModalProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  children,
  width,
  maxWidth,
  maxHeight
}) => {
  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <Overlay onClick={handleOverlayClick}>
      <ModalContent width={width} maxWidth={maxWidth} maxHeight={maxHeight}>
        {title && (
          <ModalHeader>
            <ModalTitle>{title}</ModalTitle>
            <CloseButton onClick={onClose}>×</CloseButton>
          </ModalHeader>
        )}
        {children}
      </ModalContent>
    </Overlay>
  );
};

export default Modal;