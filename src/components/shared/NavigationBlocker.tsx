import React, { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import { useImportState } from '../../contexts/ImportStateContext';
import { useNotification } from '../../contexts/NotificationContext';

interface NavigationBlockerProps {
  // Optional prop to override the default blocker behavior
  shouldBlock?: (importing: boolean) => boolean;
}

export const NavigationBlocker: React.FC<NavigationBlockerProps> = ({ 
  shouldBlock 
}) => {
  const { isImporting, importingFileName } = useImportState();
  const { showConfirmation } = useNotification();
  
  // Determine if navigation should be blocked
  const blockNavigation = shouldBlock ? shouldBlock(isImporting) : isImporting;
  
  // Block navigation when importing
  const blocker = useBlocker(blockNavigation);

  // Handle browser refresh/tab close
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (blockNavigation) {
        const message = importingFileName 
          ? `Your transaction import for "${importingFileName}" is still in progress. Leaving now will cancel the import.`
          : 'Your transaction import is still in progress. Leaving now will cancel the import.';
        
        event.preventDefault();
        event.returnValue = message;
        return message;
      }
    };

    if (blockNavigation) {
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }
  }, [blockNavigation, importingFileName]);

  // Show confirmation dialog when navigation is blocked
  useEffect(() => {
    if (blocker.state === 'blocked') {
      const message = importingFileName 
        ? `Your transaction import for "${importingFileName}" is still in progress.\n\nDo you want to cancel the import and leave this page?`
        : 'Your transaction import is still in progress.\n\nDo you want to cancel the import and leave this page?';
      
      showConfirmation(message, {
        title: 'Cancel Import?',
        confirmText: 'Leave Page',
        cancelText: 'Continue Import',
        danger: true
      }).then(shouldProceed => {
        if (shouldProceed) {
          blocker.proceed();
        } else {
          blocker.reset();
        }
      });
    }
  }, [blocker, importingFileName, showConfirmation]);

  return null;
};