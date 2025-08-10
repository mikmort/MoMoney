import React, { useEffect, useState } from 'react';
import styled from 'styled-components';

const Toast = styled.div<{ $visible: boolean }>`
  position: fixed;
  top: 20px;
  right: 20px;
  background: #f44336;
  color: white;
  padding: 16px 20px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 10000;
  opacity: ${props => props.$visible ? 1 : 0};
  transform: translateY(${props => props.$visible ? 0 : -20}px);
  transition: all 0.3s ease;
  max-width: 400px;
  
  .title {
    font-weight: 600;
    font-size: 16px;
    margin-bottom: 8px;
  }
  
  .message {
    font-size: 14px;
    line-height: 1.4;
  }
  
  .actions {
    margin-top: 12px;
    display: flex;
    gap: 8px;
  }
  
  button {
    background: rgba(255, 255, 255, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: white;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    
    &:hover {
      background: rgba(255, 255, 255, 0.3);
    }
    
    &.primary {
      background: rgba(255, 255, 255, 0.9);
      color: #f44336;
      
      &:hover {
        background: white;
      }
    }
  }
`;

const DatabaseEventHandler: React.FC = () => {
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  useEffect(() => {
    const handleDBBlocked = (event: any) => {
      console.warn('[DB Event] Database upgrade blocked:', event.detail);
      setToastMessage(event.detail.message || 'Database upgrade blocked. Please close other Mo Money tabs and refresh.');
      setShowToast(true);
    };

    const handleDBVersionChange = () => {
      console.warn('[DB Event] Database version change detected in another tab');
      setToastMessage('Database updated in another tab. Please refresh to get the latest version.');
      setShowToast(true);
    };

    // Listen for custom database events
    window.addEventListener('db-blocked', handleDBBlocked);
    window.addEventListener('db-versionchange', handleDBVersionChange);

    return () => {
      window.removeEventListener('db-blocked', handleDBBlocked);
      window.removeEventListener('db-versionchange', handleDBVersionChange);
    };
  }, []);

  const handleRefresh = () => {
    window.location.reload();
  };

  const handleDismiss = () => {
    setShowToast(false);
  };

  return (
    <Toast $visible={showToast}>
      <div className="title">⚠️ Database Issue</div>
      <div className="message">{toastMessage}</div>
      <div className="actions">
        <button className="primary" onClick={handleRefresh}>
          Refresh Page
        </button>
        <button onClick={handleDismiss}>
          Dismiss
        </button>
      </div>
    </Toast>
  );
};

export default DatabaseEventHandler;