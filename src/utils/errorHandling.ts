/**
 * Centralized error handling utility to reduce duplicate try-catch patterns
 */

export interface ErrorHandlerOptions {
  operation: string;
  fallbackValue?: any;
  logError?: boolean;
  rethrow?: boolean;
}

/**
 * Wraps an async operation with consistent error handling
 */
export const withErrorHandling = async <T>(
  asyncOperation: () => Promise<T>,
  options: ErrorHandlerOptions
): Promise<T> => {
  const { operation, fallbackValue, logError = true, rethrow = true } = options;
  
  try {
    return await asyncOperation();
  } catch (error) {
    if (logError) {
      console.error(`Error in ${operation}:`, error);
    }
    
    if (rethrow) {
      throw error;
    }
    
    return fallbackValue;
  }
};

/**
 * Wraps a sync operation with consistent error handling
 */
export const withSyncErrorHandling = <T>(
  operation: () => T,
  options: ErrorHandlerOptions
): T => {
  const { operation: operationName, fallbackValue, logError = true, rethrow = true } = options;
  
  try {
    return operation();
  } catch (error) {
    if (logError) {
      console.error(`Error in ${operationName}:`, error);
    }
    
    if (rethrow) {
      throw error;
    }
    
    return fallbackValue;
  }
};

/**
 * Simple error logging utility
 */
export const logError = (context: string, error: unknown): void => {
  console.error(`Error in ${context}:`, error);
};

/**
 * Gets error message from unknown error type
 */
export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
};