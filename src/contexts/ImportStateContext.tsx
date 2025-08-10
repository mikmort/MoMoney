import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ImportStateContextType {
  isImporting: boolean;
  importingFileName: string | null;
  setIsImporting: (importing: boolean, fileName?: string | null) => void;
}

const ImportStateContext = createContext<ImportStateContextType | undefined>(undefined);

export const useImportState = () => {
  const context = useContext(ImportStateContext);
  if (!context) {
    throw new Error('useImportState must be used within an ImportStateProvider');
  }
  return context;
};

interface ImportStateProviderProps {
  children: ReactNode;
}

export const ImportStateProvider: React.FC<ImportStateProviderProps> = ({ children }) => {
  const [isImporting, setIsImportingState] = useState(false);
  const [importingFileName, setImportingFileName] = useState<string | null>(null);

  const setIsImporting = (importing: boolean, fileName?: string | null) => {
    setIsImportingState(importing);
    setImportingFileName(importing ? fileName || null : null);
  };

  return (
    <ImportStateContext.Provider value={{
      isImporting,
      importingFileName,
      setIsImporting
    }}>
      {children}
    </ImportStateContext.Provider>
  );
};