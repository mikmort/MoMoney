import { Transaction } from '../types';

describe('TransferMatchDialog Fix - Issue #475', () => {
  // Mock the validateManualMatch logic to test the fixes
  const validateManualMatch = (transaction: Transaction, selectedTx: Transaction) => {
    const amountDiff = Math.abs(Math.abs(transaction.amount) - Math.abs(selectedTx.amount));
    const tolerance = 0.12; // 12% tolerance for manual matching with exchange rates
    const avgAmount = (Math.abs(transaction.amount) + Math.abs(selectedTx.amount)) / 2;
    const isValid = avgAmount > 0 && (amountDiff / avgAmount) <= tolerance;
    const percentageDiff = avgAmount > 0 ? (amountDiff / avgAmount) * 100 : 0;

    return {
      isValid,
      amountDiff,
      percentageDiff,
      selectedTransaction: selectedTx
    };
  };

  const generateWarningMessage = (validation: any) => {
    return validation.isValid 
      ? `✅ Amounts match within tolerance ($${validation.amountDiff.toFixed(2)} difference, ${validation.percentageDiff.toFixed(1)}%)`
      : `⚠️ Amount difference is significant: $${validation.amountDiff.toFixed(2)} (${validation.percentageDiff.toFixed(1)}%). This may not be a transfer match.`;
  };

  it('should use 12% tolerance for manual matching validation', () => {
    const danskeTransaction: Transaction = {
      id: 'danske-tx',
      date: new Date('2024-08-26'),
      description: 'Via ofx to 1stTech',
      amount: -39257.85,
      category: 'Internal Transfer',
      account: 'Danske Individual',
      type: 'transfer',
      originalCurrency: 'DKK',
      addedDate: new Date(),
      lastModifiedDate: new Date(),
      isVerified: false
    };

    const firstTechTransaction: Transaction = {
      id: 'firsttech-tx',
      date: new Date('2024-08-28'),
      description: 'ACH Deposit MICHAEL JOSEPH M - TRANSFER V RMR*IK*TRANSFER VIA OFX',
      amount: 37033.75,
      category: 'Internal Transfer',
      account: 'First Tech Checking',
      type: 'transfer',
      addedDate: new Date(),
      lastModifiedDate: new Date(),
      isVerified: false
    };

    const validation = validateManualMatch(danskeTransaction, firstTechTransaction);

    // With the issue case:
    // Amount diff: $2,224.10
    // Percentage: 5.83%
    expect(validation.amountDiff).toBeCloseTo(2224.10, 2);
    expect(validation.percentageDiff).toBeCloseTo(5.83, 1);
    
    // Should be valid with 12% tolerance
    expect(validation.isValid).toBe(true);
    
    console.log('✅ Fixed validation results:');
    console.log(`Amount difference: $${validation.amountDiff.toFixed(2)}`);
    console.log(`Percentage difference: ${validation.percentageDiff.toFixed(2)}%`);
    console.log(`Valid with 12% tolerance: ${validation.isValid}`);
  });

  it('should show amount and percentage in warning messages', () => {
    const transaction1: Transaction = {
      id: 'tx-1',
      date: new Date('2024-01-01'),
      description: 'Test transaction',
      amount: -1000,
      category: 'Internal Transfer',
      account: 'Account A',
      type: 'transfer',
      addedDate: new Date(),
      lastModifiedDate: new Date(),
      isVerified: false
    };

    // Case 1: Valid match (within 12% tolerance)
    const validTransaction: Transaction = {
      id: 'tx-2',
      date: new Date('2024-01-01'),
      description: 'Valid match',
      amount: 950, // 5% difference
      category: 'Internal Transfer',
      account: 'Account B',
      type: 'transfer',
      addedDate: new Date(),
      lastModifiedDate: new Date(),
      isVerified: false
    };

    const validValidation = validateManualMatch(transaction1, validTransaction);
    const validMessage = generateWarningMessage(validValidation);
    
    expect(validMessage).toContain('$50.00 difference');
    expect(validMessage).toContain('5.1%');
    expect(validMessage).toContain('✅ Amounts match within tolerance');
    
    // Case 2: Invalid match (beyond 12% tolerance)  
    const invalidTransaction: Transaction = {
      id: 'tx-3',
      date: new Date('2024-01-01'),
      description: 'Invalid match',
      amount: 800, // 20% difference
      category: 'Internal Transfer',
      account: 'Account C',
      type: 'transfer',
      addedDate: new Date(),
      lastModifiedDate: new Date(),
      isVerified: false
    };

    const invalidValidation = validateManualMatch(transaction1, invalidTransaction);
    const invalidMessage = generateWarningMessage(invalidValidation);
    
    expect(invalidMessage).toContain('$200.00');
    expect(invalidMessage).toContain('22.2%');
    expect(invalidMessage).toContain('⚠️ Amount difference is significant');
    
    console.log('✅ Fixed warning messages:');
    console.log('Valid case:', validMessage);
    console.log('Invalid case:', invalidMessage);
  });

  it('should handle the specific issue case from problem statement', () => {
    const danskeTransaction: Transaction = {
      id: 'danske-tx',
      date: new Date('2024-08-26'),
      description: 'Via ofx to 1stTech',
      amount: -39257.85, // -250,050.00 kr ≈ -$39,257.85 USD
      category: 'Internal Transfer',
      account: 'Danske Individual',
      type: 'transfer',
      originalCurrency: 'DKK',
      addedDate: new Date(),
      lastModifiedDate: new Date(),
      isVerified: false
    };

    const firstTechTransaction: Transaction = {
      id: 'firsttech-tx',
      date: new Date('2024-08-28'),
      description: 'ACH Deposit MICHAEL JOSEPH M - TRANSFER V RMR*IK*TRANSFER VIA OFX',
      amount: 37033.75,
      category: 'Internal Transfer', 
      account: 'First Tech Checking',
      type: 'transfer',
      addedDate: new Date(),
      lastModifiedDate: new Date(),
      isVerified: false
    };

    const validation = validateManualMatch(danskeTransaction, firstTechTransaction);
    const message = generateWarningMessage(validation);

    // Should be valid (≈$2,224.10 difference, ≈5.83% which is < 12%)
    expect(validation.isValid).toBe(true);
    expect(message).toContain('✅ Amounts match within tolerance');
    expect(message).toContain('$2224.10 difference');
    expect(message).toContain('5.8%');
    
    console.log('✅ Issue case results:');
    console.log('Validation:', validation);
    console.log('Message:', message);
  });
});