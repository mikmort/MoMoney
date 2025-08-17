import { Transaction } from '../types';
import { transferMatchingService } from '../services/transferMatchingService';

describe('Debug Issue #475 - Relaxed Transfer Matching', () => {
  it('should find matches for the specific issue case', async () => {
    const transactions: Transaction[] = [
      {
        id: 'danske-tx',
        date: new Date('2024-08-26'),
        description: 'Via ofx to 1stTech',
        amount: -39257.85, // ≈ -$39,257.85 USD (converted from -250,050.00 kr)
        category: 'Internal Transfer',
        account: 'Danske Individual',
        type: 'transfer',
        originalCurrency: 'DKK',
        addedDate: new Date(),
        lastModifiedDate: new Date(),
        isVerified: false
      },
      {
        id: 'firsttech-tx',
        date: new Date('2024-08-28'),
        description: 'ACH Deposit MICHAEL JOSEPH M - TRANSFER V RMR*IK*TRANSFER VIA OFX',
        amount: 37033.75, // $37,033.75
        category: 'Internal Transfer',
        account: 'First Tech Checking',
        type: 'transfer',
        addedDate: new Date(),
        lastModifiedDate: new Date(),
        isVerified: false
      }
    ];

    // Calculate expected values
    const dateDiff = Math.abs((transactions[0].date.getTime() - transactions[1].date.getTime()) / (1000 * 60 * 60 * 24));
    const amountDiff = Math.abs(Math.abs(transactions[0].amount) - Math.abs(transactions[1].amount));
    const avgAmount = (Math.abs(transactions[0].amount) + Math.abs(transactions[1].amount)) / 2;
    const percentageDiff = (amountDiff / avgAmount) * 100;
    
    console.log('🔍 Debug information:');
    console.log(`Date difference: ${dateDiff} days (should be ≤ 8)`);
    console.log(`Amount difference: $${amountDiff.toFixed(2)}`);
    console.log(`Average amount: $${avgAmount.toFixed(2)}`);
    console.log(`Percentage difference: ${percentageDiff.toFixed(2)}% (should be ≤ 12%)`);
    console.log(`Within 8 days: ${dateDiff <= 8}`);
    console.log(`Within 12% tolerance: ${percentageDiff <= 12}`);

    // Test manual transfer matching
    const result = await transferMatchingService.findManualTransferMatches({
      transactions,
      maxDaysDifference: 8,
      tolerancePercentage: 0.12
    });

    console.log(`\nFound ${result.matches.length} matches`);
    
    if (result.matches.length > 0) {
      result.matches.forEach((match, index) => {
        console.log(`Match ${index + 1}:`, {
          id: match.id,
          confidence: Math.round(match.confidence * 100) + '%',
          matchType: match.matchType,
          dateDifference: match.dateDifference,
          amountDifference: match.amountDifference,
          reasoning: match.reasoning
        });
      });
    } else {
      console.log('❌ No matches found - this is the issue!');
    }

    // Test the areAmountsMatching function directly to see what's failing
    const transferService = transferMatchingService as any;
    const oppositeSigns = (-39257.85 > 0) !== (37033.75 > 0);
    console.log(`\n🔬 Direct function tests:`);
    console.log(`Opposite signs check: ${oppositeSigns}`);
    
    const abs1 = Math.abs(-39257.85);
    const abs2 = Math.abs(37033.75);
    const diff = Math.abs(abs1 - abs2);
    const avgAmt = (abs1 + abs2) / 2;
    const toleranceCheck = avgAmt > 0 && (diff / avgAmt) <= 0.12;
    console.log(`Manual tolerance check: ${diff} / ${avgAmt} = ${(diff/avgAmt).toFixed(4)} ≤ 0.12 = ${toleranceCheck}`);
    
    const areAmountsMatching = transferService.areAmountsMatching(-39257.85, 37033.75, 0.12);
    console.log(`areAmountsMatching result: ${areAmountsMatching}`);

    // Test same account check (this might be the issue)
    console.log(`\n📋 Account check:`);
    console.log(`Account 1: "${transactions[0].account}"`);
    console.log(`Account 2: "${transactions[1].account}"`);
    console.log(`Same account: ${transactions[0].account === transactions[1].account}`);

    // This should find matches given the criteria
    expect(result.matches.length).toBeGreaterThan(0);
  });
});