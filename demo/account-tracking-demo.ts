// Demo test file for account tracking functionality
import { defaultAccounts, accountDetectionPatterns } from '../src/data/defaultAccounts';

console.log('=== Account Tracking Demo ===');
console.log('');

console.log('📋 Available Accounts:');
defaultAccounts.forEach(account => {
  console.log(`  • ${account.name} (${account.type}) - ${account.institution}`);
});

console.log('');
console.log('🔍 Account Detection Patterns:');
Object.entries(accountDetectionPatterns).forEach(([accountId, patterns]) => {
  const account = defaultAccounts.find(acc => acc.id === accountId);
  console.log(`  ${account?.name}:`);
  patterns.forEach(pattern => {
    console.log(`    - "${pattern}"`);
  });
});

console.log('');
console.log('🧪 Test File Detection:');
const testFiles = [
  'chase_checking_statement.pdf',
  'amex_platinum_january.xlsx', 
  'discover_card_2025.csv',
  'savings_account_statement.pdf',
  'unknown_bank_file.txt'
];

testFiles.forEach(filename => {
  console.log(`  File: ${filename}`);
  
  // Simulate pattern detection
  let detected = false;
  for (const [accountId, patterns] of Object.entries(accountDetectionPatterns)) {
    for (const pattern of patterns) {
      if (filename.toLowerCase().includes(pattern.toLowerCase())) {
        const account = defaultAccounts.find(acc => acc.id === accountId);
        console.log(`    ✅ Auto-detected: ${account?.name} (confidence: 90%)`);
        detected = true;
        break;
      }
    }
    if (detected) break;
  }
  
  if (!detected) {
    console.log(`    ❓ Needs manual selection`);
  }
  console.log('');
});

export {}; // Make this a module
