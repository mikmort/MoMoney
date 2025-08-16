/**
 * Unique Identifier Detection Utilities
 * 
 * This module provides functions to detect if transaction descriptions contain
 * unique identifiers that would make auto-generated rules ineffective.
 */

/**
 * Patterns that indicate unique identifiers in transaction descriptions
 */
const UNIQUE_IDENTIFIER_PATTERNS = [
  // Long sequences of digits (10+ digits) that likely represent unique IDs
  /\b\d{10,}\b/,
  
  // Alphanumeric transaction codes with special characters
  // Like: DE*2S28Q87V5, ABC*123XYZ, etc.
  /\b[A-Z]{2,}[*-][A-Z0-9]{4,}\b/i,
  
  // Reference numbers with specific prefixes
  /\b(REF|TXN|ID|CONF|AUTH)[:\s-]?[A-Z0-9]{4,}\b/i,
  
  // Credit card-style patterns (groups of 4 digits)
  /\b\d{4}[\s-]\d{4}[\s-]\d{4}[\s-]\d{4}\b/,
  
  // Long alphanumeric codes (10+ characters mixing letters and numbers)
  /\b[A-Z0-9]*[A-Z][A-Z0-9]*\d[A-Z0-9]{8,}\b/i,
  /\b[A-Z0-9]*\d[A-Z0-9]*[A-Z][A-Z0-9]{8,}\b/i,
];

/**
 * Keywords that often precede or follow unique identifiers
 */
const UNIQUE_IDENTIFIER_KEYWORDS = [
  'ref', 'reference', 'confirmation', 'conf', 'auth', 'authorization',
  'txn', 'transaction', 'id', 'number', 'no', '#', 'bill', 'invoice',
  'order', 'ticket', 'booking', 'reservation'
];

/**
 * Detects if a transaction description contains unique identifiers
 * that would make it unsuitable for creating auto-rules
 */
export function containsUniqueIdentifiers(description: string): boolean {
  if (!description || description.trim().length === 0) {
    return false;
  }
  
  // Check for direct pattern matches
  for (const pattern of UNIQUE_IDENTIFIER_PATTERNS) {
    if (pattern.test(description)) {
      return true;
    }
  }
  
  // Check for keyword + number combinations with more specific patterns  
  for (const keyword of UNIQUE_IDENTIFIER_KEYWORDS) {
    // Look for keyword followed by very long numeric codes (10+ digits)
    const longNumericPattern = new RegExp(`\\b${keyword}[:\\s#-]+\\d{10,}\\b`, 'i');
    if (longNumericPattern.test(description)) {
      return true;
    }
    
    // Look for keyword followed by mixed alphanumeric codes (6+ chars, must have both letters and numbers)
    const mixedAlphaNumPattern = new RegExp(`\\b${keyword}[:\\s#-]+([a-z0-9]{6,})\\b`, 'i');
    const match = description.match(mixedAlphaNumPattern);
    if (match) {
      const identifier = match[1];
      // Accept if:
      // 1. Has both letters and numbers
      // 2. Is very long (10+ chars) OR has complex pattern (not just letters followed by digits)
      if (identifier && /[a-z]/i.test(identifier) && /\d/.test(identifier)) {
        const isSimplePattern = /^[a-z]+\d+$/i.test(identifier);
        const isVeryLong = identifier.length >= 10;
        if (isVeryLong || !isSimplePattern) {
          return true;
        }
      }
    }
    
    // Look for reversed patterns
    const reverseLongNumericPattern = new RegExp(`\\b\\d{10,}[\\s-]+${keyword}\\b`, 'i');
    if (reverseLongNumericPattern.test(description)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Gets detailed information about detected unique identifiers
 * Useful for debugging and logging
 */
export function getUniqueIdentifierDetails(description: string): {
  hasUniqueIdentifiers: boolean;
  detectedPatterns: Array<{
    pattern: string;
    match: string;
    reason: string;
  }>;
} {
  const details = {
    hasUniqueIdentifiers: false,
    detectedPatterns: [] as Array<{
      pattern: string;
      match: string;
      reason: string;
    }>
  };

  if (!description || description.trim().length === 0) {
    return details;
  }

  // Check each pattern
  const patternReasons = [
    { pattern: /\b\d{10,}\b/, reason: 'Long numeric sequence (10+ digits)' },
    { pattern: /\b[A-Z]{2,}[*-][A-Z0-9]{4,}\b/i, reason: 'Alphanumeric transaction code with separator' },
    { pattern: /\b(REF|TXN|ID|CONF|AUTH)[:\s-]?[A-Z0-9]{4,}\b/i, reason: 'Reference number with prefix' },
    { pattern: /\b\d{4}[\s-]\d{4}[\s-]\d{4}[\s-]\d{4}\b/, reason: 'Credit card-style number' },
    { pattern: /\b[A-Z0-9]*[A-Z][A-Z0-9]*\d[A-Z0-9]{8,}\b/i, reason: 'Long mixed alphanumeric code' },
    { pattern: /\b[A-Z0-9]*\d[A-Z0-9]*[A-Z][A-Z0-9]{8,}\b/i, reason: 'Long mixed alphanumeric code' }
  ];

  for (const { pattern, reason } of patternReasons) {
    const match = description.match(pattern);
    if (match) {
      details.detectedPatterns.push({
        pattern: pattern.toString(),
        match: match[0],
        reason
      });
      details.hasUniqueIdentifiers = true;
    }
  }

  // Check keyword patterns with updated requirements
  for (const keyword of UNIQUE_IDENTIFIER_KEYWORDS) {
    const longNumericPattern = new RegExp(`\\b${keyword}[:\\s#-]+\\d{10,}\\b`, 'i');
    
    let match = description.match(longNumericPattern);
    if (match) {
      details.detectedPatterns.push({
        pattern: longNumericPattern.toString(),
        match: match[0],
        reason: `Keyword '${keyword}' followed by long numeric identifier (10+ digits)`
      });
      details.hasUniqueIdentifiers = true;
    }
    
    // Check for mixed alphanumeric codes more carefully
    const mixedAlphaNumPattern = new RegExp(`\\b${keyword}[:\\s#-]+([a-z0-9]{6,})\\b`, 'i');
    match = description.match(mixedAlphaNumPattern);
    if (match) {
      const identifier = match[1];
      if (identifier && /[a-z]/i.test(identifier) && /\d/.test(identifier)) {
        const isSimplePattern = /^[a-z]+\d+$/i.test(identifier);
        const isVeryLong = identifier.length >= 10;
        if (isVeryLong || !isSimplePattern) {
          details.detectedPatterns.push({
            pattern: mixedAlphaNumPattern.toString(),
            match: match[0],
            reason: `Keyword '${keyword}' followed by mixed alphanumeric identifier`
          });
          details.hasUniqueIdentifiers = true;
        }
      }
    }
    
    const reverseLongNumericPattern = new RegExp(`\\b\\d{10,}[\\s-]+${keyword}\\b`, 'i');
    match = description.match(reverseLongNumericPattern);
    if (match) {
      details.detectedPatterns.push({
        pattern: reverseLongNumericPattern.toString(),
        match: match[0],
        reason: `Long numeric identifier followed by keyword '${keyword}'`
      });
      details.hasUniqueIdentifiers = true;
    }
  }

  return details;
}