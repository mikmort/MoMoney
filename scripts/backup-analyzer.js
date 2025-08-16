#!/usr/bin/env node

/**
 * Command-line tool to analyze MoMoney backup files for data integrity issues
 * Usage: node backup-analyzer.js [backup-file.json]
 */

const fs = require('fs');
const path = require('path');

// Simple version of the backup integrity analysis for command line use
function analyzeBackupFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  let backupData;
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    backupData = JSON.parse(fileContent);
  } catch (error) {
    console.error(`Error: Failed to parse backup file: ${error.message}`);
    process.exit(1);
  }

  console.log('🔍 MoMoney Backup Data Integrity Analysis');
  console.log('=' .repeat(50));

  const transactions = backupData.transactions || [];
  const accounts = backupData.accounts || [];

  console.log(`📊 Basic Statistics:`);
  console.log(`   Backup Version: ${backupData.version || 'unknown'}`);
  console.log(`   Export Date: ${backupData.exportDate || 'unknown'}`);
  console.log(`   Total Transactions: ${transactions.length}`);
  console.log(`   Total Accounts: ${accounts.length}`);

  // Build account lookup
  const accountNames = new Set(accounts.map(acc => acc.name || ''));
  const accountIds = new Set(accounts.map(acc => acc.id || ''));

  // Analysis counters
  let issues = [];
  let warnings = [];

  // 1. Check for orphaned account references
  const orphanedTransactions = transactions.filter(tx => {
    const account = tx.account || '';
    return !accountNames.has(account) && !accountIds.has(account);
  });

  if (orphanedTransactions.length > 0) {
    issues.push(`${orphanedTransactions.length} transactions reference non-existent accounts`);
  }

  // 2. Check for missing required fields
  const requiredFields = ['id', 'date', 'description', 'amount', 'account', 'type'];
  const missingFields = {};
  
  for (const field of requiredFields) {
    missingFields[field] = transactions.filter(tx => {
      const value = tx[field];
      return !value || (typeof value === 'string' && value.trim() === '');
    }).length;
  }

  for (const [field, count] of Object.entries(missingFields)) {
    if (count > 0) {
      issues.push(`${count} transactions missing required field: ${field}`);
    }
  }

  // 3. Check for invalid dates
  const dateIssues = [];
  const currentYear = new Date().getFullYear();
  
  for (const tx of transactions) {
    try {
      const date = new Date(tx.date);
      if (isNaN(date.getTime())) {
        dateIssues.push(tx.id || 'unknown');
      } else if (date.getFullYear() > currentYear + 1 || date.getFullYear() < 1900) {
        dateIssues.push(tx.id || 'unknown');
      }
    } catch (error) {
      dateIssues.push(tx.id || 'unknown');
    }
  }

  if (dateIssues.length > 0) {
    issues.push(`${dateIssues.length} transactions have invalid dates`);
  }

  // 4. Check for invalid amounts
  const invalidAmounts = transactions.filter(tx => {
    const amount = tx.amount;
    return amount === null || amount === undefined || 
           typeof amount !== 'number' || isNaN(amount) || !isFinite(amount);
  });

  if (invalidAmounts.length > 0) {
    issues.push(`${invalidAmounts.length} transactions have invalid amounts`);
  }

  // 5. Detect duplicate transactions
  const signatureMap = new Map();
  
  for (const tx of transactions) {
    const dateStr = (tx.date || '').toString().substring(0, 10);
    const amount = tx.amount || 0;
    const description = (tx.description || '').substring(0, 20);
    const signature = `${dateStr}|${amount}|${description}`;
    
    if (!signatureMap.has(signature)) {
      signatureMap.set(signature, []);
    }
    signatureMap.get(signature).push(tx);
  }
  
  const duplicateGroups = Array.from(signatureMap.values()).filter(group => group.length > 1);
  
  if (duplicateGroups.length > 0) {
    const totalDuplicates = duplicateGroups.reduce((sum, group) => sum + group.length, 0);
    warnings.push(`${duplicateGroups.length} potential duplicate groups (${totalDuplicates} total duplicates)`);
  }

  // 6. Find large transactions
  const largeTransactions = transactions.filter(tx => Math.abs(tx.amount || 0) > 100000);
  
  if (largeTransactions.length > 0) {
    warnings.push(`${largeTransactions.length} transactions with large amounts (>$100k)`);
  }

  // Results summary
  console.log('\\n🔍 Integrity Analysis Results:');
  
  if (issues.length === 0) {
    console.log('✅ No critical data corruption detected!');
  } else {
    console.log('❌ Critical Issues Found:');
    issues.forEach(issue => console.log(`   • ${issue}`));
  }
  
  if (warnings.length > 0) {
    console.log('\\n⚠️  Warnings:');
    warnings.forEach(warning => console.log(`   • ${warning}`));
  }

  if (duplicateGroups.length > 0) {
    console.log('\\n📋 Sample Duplicate Groups:');
    duplicateGroups.slice(0, 3).forEach((group, index) => {
      console.log(`\\n   Group ${index + 1} (${group.length} transactions):`);
      group.forEach(tx => {
        const date = (tx.date || '').substring(0, 10);
        const amount = (tx.amount || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
        const desc = (tx.description || '').substring(0, 30);
        console.log(`     ${tx.id} | ${date} | ${amount} | ${desc}... | ${tx.account || 'No Account'}`);
      });
    });
  }

  if (largeTransactions.length > 0) {
    console.log('\\n💰 Large Transactions:');
    largeTransactions.slice(0, 5).forEach(tx => {
      const date = (tx.date || '').substring(0, 10);
      const amount = (tx.amount || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
      const desc = (tx.description || '').substring(0, 40);
      console.log(`   ${date} | ${amount} | ${desc}... | ${tx.account || 'No Account'}`);
    });
    
    if (largeTransactions.length > 5) {
      console.log(`   ... and ${largeTransactions.length - 5} more large transactions`);
    }
  }

  console.log('\\n📈 Summary:');
  console.log(`   Critical Issues: ${issues.length}`);
  console.log(`   Warnings: ${warnings.length}`);
  console.log(`   Health Status: ${issues.length === 0 ? '✅ Healthy' : '❌ Needs Attention'}`);

  // Exit code based on results
  process.exit(issues.length > 0 ? 1 : 0);
}

// Main execution
const args = process.argv.slice(2);
const backupFile = args[0];

if (!backupFile) {
  console.log('Usage: node backup-analyzer.js <backup-file.json>');
  console.log('');
  console.log('Analyzes a MoMoney backup file for data integrity issues including:');
  console.log('  • Orphaned account references');
  console.log('  • Missing required fields');
  console.log('  • Invalid dates and amounts');
  console.log('  • Duplicate transactions');
  console.log('  • Large transactions (>$100k)');
  process.exit(1);
}

analyzeBackupFile(backupFile);