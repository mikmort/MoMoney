#!/usr/bin/env node

import { Transaction } from './src/types';
import { transferMatchingService } from './src/services/transferMatchingService';

// Test case based on the issue description
const testCase = async () => {
  console.log('🔍 Testing the specific issue case...\n');

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

  console.log('Transaction 1:', {
    description: transactions[0].description,
    amount: transactions[0].amount,
    account: transactions[0].account,
    date: transactions[0].date.toDateString(),
    originalCurrency: transactions[0].originalCurrency
  });

  console.log('Transaction 2:', {
    description: transactions[1].description,
    amount: transactions[1].amount,
    account: transactions[1].account,
    date: transactions[1].date.toDateString()
  });

  // Calculate expected values
  const dateDiff = Math.abs((transactions[0].date.getTime() - transactions[1].date.getTime()) / (1000 * 60 * 60 * 24));
  const amountDiff = Math.abs(Math.abs(transactions[0].amount) - Math.abs(transactions[1].amount));
  const avgAmount = (Math.abs(transactions[0].amount) + Math.abs(transactions[1].amount)) / 2;
  const percentageDiff = (amountDiff / avgAmount) * 100;
  
  console.log('\n📊 Expected calculations:');
  console.log(`Date difference: ${dateDiff} days`);
  console.log(`Amount difference: $${amountDiff.toFixed(2)}`);
  console.log(`Average amount: $${avgAmount.toFixed(2)}`);
  console.log(`Percentage difference: ${percentageDiff.toFixed(2)}%`);
  console.log(`Within 8 days: ${dateDiff <= 8}`);
  console.log(`Within 12% tolerance: ${percentageDiff <= 12}`);

  // Test manual transfer matching
  console.log('\n🔄 Testing manual transfer matching...');
  const result = await transferMatchingService.findManualTransferMatches({
    transactions,
    maxDaysDifference: 8,
    tolerancePercentage: 0.12
  });

  console.log(`Found ${result.matches.length} matches`);
  
  if (result.matches.length > 0) {
    result.matches.forEach((match, index) => {
      console.log(`\nMatch ${index + 1}:`, {
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

  // Let's also test the amount matching function directly
  console.log('\n🔬 Testing areAmountsMatching directly...');
  const transferService = transferMatchingService as any;
  const areAmountsMatching = transferService.areAmountsMatching(-39257.85, 37033.75, 0.12);
  console.log(`areAmountsMatching result: ${areAmountsMatching}`);
  
  // Test opposite signs
  const oppositeSigns = (-39257.85 > 0) !== (37033.75 > 0);
  console.log(`Opposite signs check: ${oppositeSigns}`);
  
  // Test tolerance calculation
  const abs1 = Math.abs(-39257.85);
  const abs2 = Math.abs(37033.75);
  const diff = Math.abs(abs1 - abs2);
  const avgAmt = (abs1 + abs2) / 2;
  const toleranceCheck = avgAmt > 0 && (diff / avgAmt) <= 0.12;
  console.log(`Manual tolerance check: ${diff} / ${avgAmt} = ${(diff/avgAmt).toFixed(4)} <= 0.12 = ${toleranceCheck}`);
};

testCase().catch(console.error);