# Internal Transfer Category/Type Sync Fix - Issue #532

## Summary
Fixed a data consistency issue where transactions could have category "Internal Transfer" but incorrect type ("income" or "expense" instead of "transfer").

## Problem Description
The issue manifested when transactions were created with:
- `category: "Internal Transfer"`  
- `type: "expense"` or `type: "income"` (should be `type: "transfer"`)

Example problematic transaction from the issue:
```json
{
  "category": "Internal Transfer",
  "type": "expense",
  "description": "ACH Debit CAPITAL ONE  - CRCARDPMT"
}
```

## Root Cause Analysis
The codebase had multiple layers of protection but three critical code paths were missing proper type synchronization:

1. **addTransaction method** - Did not enforce type sync for special categories
2. **addTransactions method** - Did not enforce type sync during bulk operations  
3. **rulesService.reclassifyExistingTransactions** - Did not apply rule's transactionType field

## Solutions Implemented

### 1. Enhanced addTransaction Method
```typescript
// Before: No type sync
const newTransaction: Transaction = { ...transaction, id: uuidv4() };

// After: Automatic type sync
let correctedTransaction = { ...transaction };
if (transaction.category === 'Internal Transfer') {
  correctedTransaction.type = 'transfer';
} else if (transaction.category === 'Asset Allocation') {
  correctedTransaction.type = 'asset-allocation';
}
const newTransaction: Transaction = { ...correctedTransaction, id: uuidv4() };
```

### 2. Enhanced addTransactions Method  
Applied the same type synchronization logic during bulk transaction creation to ensure consistency across all transaction creation paths.

### 3. Fixed rulesService.reclassifyExistingTransactions
```typescript
// Before: Missing transactionType from rule
const updates: Partial<Transaction> = {
  category: rule.action.categoryName,
  subcategory: rule.action.subcategoryName,
};

// After: Includes transactionType when specified
const updates: Partial<Transaction> = {
  category: rule.action.categoryName,
  subcategory: rule.action.subcategoryName,
};

// Apply transaction type if specified in the rule
if (rule.action.transactionType) {
  updates.type = rule.action.transactionType;
}
```

## Data Migration
The existing migration logic was already correct and continues to work:
- `migrateInternalTransferTypes()` runs at startup
- Fixes any existing transactions with category='Internal Transfer' but type != 'transfer'
- Migration is idempotent and safe to run multiple times

## Test Coverage Added

### 1. Comprehensive Data Consistency Test
- Tests migration fixing existing problematic data
- Tests prevention of new problematic data creation
- Tests rule-based transaction updates
- Edge cases and error handling

### 2. Issue-Specific Test (Issue #532)
- Tests the exact problematic transaction from the issue description
- Validates the migration fixes it correctly
- Tests prevention through all major code paths
- Validates Asset Allocation category works similarly

## Validation Results

### All Tests Pass
- ✅ 24 Internal Transfer related tests pass
- ✅ 87 Transfer-related tests pass  
- ✅ All existing functionality preserved
- ✅ Build succeeds without errors

### Code Paths Protected
1. **Direct transaction creation** - `addTransaction()` ✅
2. **Bulk transaction creation** - `addTransactions()` ✅  
3. **Transaction updates** - `updateTransaction()` ✅ (existing)
4. **Batch updates** - `batchUpdateTransactions()` ✅ (existing)
5. **Rule reclassification** - `reclassifyExistingTransactions()` ✅ (fixed)
6. **File import processing** - `fileProcessingService` ✅ (existing)
7. **Startup migration** - `migrateInternalTransferTypes()` ✅ (existing)

## Impact
- **Data Integrity**: Ensures all Internal Transfer transactions have consistent type='transfer'
- **User Experience**: Prevents confusion from mismatched category/type combinations
- **System Reliability**: Multiple layers of protection prevent the issue from recurring
- **Backward Compatibility**: Existing data is automatically migrated without user intervention

## Files Modified
- `src/services/dataService.ts` - Enhanced transaction creation methods
- `src/services/rulesService.ts` - Fixed rule reclassification to apply transactionType
- `src/__tests__/internalTransferDataConsistencyFix.test.ts` - Comprehensive test suite
- `src/__tests__/issue532Fix.test.ts` - Issue-specific validation tests

The fix is comprehensive, well-tested, and maintains backward compatibility while preventing the issue from recurring through any code path.