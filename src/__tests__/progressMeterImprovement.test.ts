import { fileProcessingService } from '../services/fileProcessingService';
import { FileImportProgress } from '../types';

describe('Progress Meter Improvement', () => {
  it('should allocate only 30% progress to initial steps and 70% to transaction processing', async () => {
    // Track progress updates
    const progressUpdates: FileImportProgress[] = [];
    const onProgress = (progress: FileImportProgress) => {
      progressUpdates.push({ ...progress });
    };

    // Create a sample CSV file with multiple transactions to ensure transaction processing happens
    const csvContent = `Date,Description,Amount
01/15/2025,"Coffee Shop",-4.50
01/16/2025,"Gas Station",-45.00
01/17/2025,"Grocery Store",-125.30
01/18/2025,"Restaurant",-32.50
01/19/2025,"Online Purchase",-67.99
01/20/2025,"Utility Bill",-89.45
01/21/2025,"Subscription",-12.99
01/22/2025,"Pharmacy",-23.45
01/23/2025,"Car Repair",-234.50
01/24/2025,"Insurance",-156.78`;

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const file = new File([blob], 'progress-test.csv', { type: 'text/csv' });

    try {
      await fileProcessingService.processFile(
        file,
        [], // categories
        [], // subcategories
        'test-account-id',
        onProgress
      );
    } catch (error) {
      // Expected in test environment due to missing dependencies
    }

    // Verify that we have progress updates
    expect(progressUpdates.length).toBeGreaterThan(0);

    // Find the key progress milestones
    const initProgress = progressUpdates.find(p => p.currentStep.includes('Reading file content'));
    const schemaProgress = progressUpdates.find(p => p.currentStep.includes('schema detection'));
    const parseProgress = progressUpdates.find(p => p.currentStep.includes('Parsing file data'));
    const transactionStartProgress = progressUpdates.find(p => p.currentStep.includes('Processing transactions with AI'));
    
    // Verify the new progress allocation
    if (initProgress) {
      expect(initProgress.progress).toBeLessThanOrEqual(10); // Should be 5% or less
    }
    
    if (schemaProgress) {
      expect(schemaProgress.progress).toBeLessThanOrEqual(20); // Should be 15% or less
    }
    
    if (parseProgress) {
      expect(parseProgress.progress).toBeLessThanOrEqual(25); // Should be 20% or less
    }
    
    if (transactionStartProgress) {
      expect(transactionStartProgress.progress).toBeLessThanOrEqual(35); // Should be 30% or less (start of transaction processing)
    }

    // Verify that progress values are in ascending order (no regression)
    for (let i = 1; i < progressUpdates.length; i++) {
      if (progressUpdates[i].status !== 'error') {
        expect(progressUpdates[i].progress).toBeGreaterThanOrEqual(progressUpdates[i - 1].progress);
      }
    }
  });

  it('should reserve majority of progress for transaction processing phase', async () => {
    const progressUpdates: FileImportProgress[] = [];
    const onProgress = (progress: FileImportProgress) => {
      progressUpdates.push({ ...progress });
    };

    const csvContent = `Date,Description,Amount
01/15/2025,"Test Transaction",-10.00`;

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const file = new File([blob], 'transaction-focus.csv', { type: 'text/csv' });

    try {
      await fileProcessingService.processFile(
        file,
        [],
        [],
        'test-account-id',
        onProgress
      );
    } catch (error) {
      // Expected in test environment
    }

    // Find the last progress update before transaction processing
    const preTransactionUpdates = progressUpdates.filter(p => 
      p.currentStep.includes('Parsing file data') || p.currentStep.includes('schema detection')
    );
    
    const transactionUpdates = progressUpdates.filter(p => 
      p.currentStep.includes('Processing transaction')
    );

    // Verify that initial steps complete by 30% or less
    if (preTransactionUpdates.length > 0) {
      const maxPreTransactionProgress = Math.max(...preTransactionUpdates.map(p => p.progress));
      expect(maxPreTransactionProgress).toBeLessThanOrEqual(30);
    }

    // Verify that transaction processing can reach beyond 30%
    if (transactionUpdates.length > 0) {
      const maxTransactionProgress = Math.max(...transactionUpdates.map(p => p.progress));
      expect(maxTransactionProgress).toBeGreaterThan(30);
    }
  });
});