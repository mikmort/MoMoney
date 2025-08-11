/**
 * PII Sanitization Utilities
 * 
 * This module provides functions to sanitize personally identifiable information (PII)
 * before sending data to external AI services like Azure OpenAI.
 */

export interface SanitizationOptions {
  /** Whether to mask account numbers */
  maskAccountNumbers?: boolean;
  /** Whether to remove email addresses */
  removeEmails?: boolean;
  /** Whether to remove phone numbers */
  removePhoneNumbers?: boolean;
  /** Whether to sanitize addresses */
  sanitizeAddresses?: boolean;
  /** Whether to round large amounts to ranges */
  roundLargeAmounts?: boolean;
  /** Threshold for "large amounts" that should be rounded */
  largeAmountThreshold?: number;
}

const DEFAULT_OPTIONS: Required<SanitizationOptions> = {
  maskAccountNumbers: true,
  removeEmails: true,
  removePhoneNumbers: true,
  sanitizeAddresses: true,
  roundLargeAmounts: false, // Keep amounts precise for better AI classification
  largeAmountThreshold: 1000
};

/**
 * Sanitizes a transaction description to remove PII before sending to AI services
 */
export function sanitizeTransactionDescription(
  description: string,
  options: SanitizationOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let sanitized = description;

  // Remove phone numbers FIRST (before account numbers to avoid conflicts)
  if (opts.removePhoneNumbers) {
    // Match patterns like: (123) 456-7890, 123-456-7890, 123.456.7890, 1234567890
    sanitized = sanitized.replace(/(?:\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[PHONE]');
  }

  // Remove/mask account numbers (6+ consecutive digits)
  if (opts.maskAccountNumbers) {
    sanitized = sanitized.replace(/\b\d{6,}\b/g, (match) => {
      // Keep the last 3 digits for context, mask the rest
      if (match.length >= 6) {
        const lastThree = match.slice(-3);
        const masked = '*'.repeat(Math.max(3, match.length - 3));
        return `${masked}${lastThree}`;
      }
      return match;
    });
  }

  // Remove email addresses
  if (opts.removeEmails) {
    // Unicode-friendly email regex without word boundaries on the left
    sanitized = sanitized.replace(/[^\s@]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]');
  }

  // Sanitize street addresses
  if (opts.sanitizeAddresses) {
    // Match patterns like "123 Main St", "456 Oak Avenue", etc.
    sanitized = sanitized.replace(/\b\d{1,5}\s+[A-Za-z\s]+(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Circle|Cir)\b/gi, '[ADDRESS]');
  }

  return sanitized.trim();
}

/**
 * Sanitizes a transaction amount if needed
 */
export function sanitizeTransactionAmount(
  amount: number,
  options: SanitizationOptions = {}
): number {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!opts.roundLargeAmounts) {
    return amount;
  }

  const absAmount = Math.abs(amount);
  if (absAmount >= opts.largeAmountThreshold) {
    // Round to nearest $50 for large amounts
    const sign = amount < 0 ? -1 : 1;
    const rounded = Math.round(absAmount / 50) * 50;
    return rounded * sign;
  }

  return amount;
}

/**
 * Sanitizes file content (like bank statements) to remove PII
 */
export function sanitizeFileContent(
  content: string,
  options: SanitizationOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let sanitized = content;

  // Handle ZIP codes first (5 or 5+4 format)
  if (opts.sanitizeAddresses) {
    sanitized = sanitized.replace(/\b\d{5}-\d{4}\b/g, '[ZIP]');
    sanitized = sanitized.replace(/\b\d{5}\b/g, '[ZIP]');
  }

  // Handle routing numbers (exactly 9 digits, but not already replaced ZIP codes)
  if (opts.maskAccountNumbers) {
    sanitized = sanitized.replace(/\b\d{9}\b/g, (match) => {
      // Only replace if not part of a ZIP code pattern
      return '[ROUTING]';
    });
  }

  // Remove SSN patterns (3-2-4 format, but avoid ZIP codes)
  sanitized = sanitized.replace(/\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g, '[SSN]');

  if (opts.maskAccountNumbers) {
    // Credit card format - show only last 4
    sanitized = sanitized.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, (match) => {
      const digits = match.replace(/\D/g, '');
      return `****-****-****-${digits.slice(-4)}`;
    });

    // Bank account numbers (8-17 digits, but avoid routing numbers and ZIP codes)
    sanitized = sanitized.replace(/\b\d{8,17}\b/g, (match) => {
      // Skip if it's exactly 9 digits (routing number territory)
      if (match.length === 9) return match;
      // Skip if it looks like it was already processed
      if (match.includes('[')) return match;
      const lastFour = match.slice(-4);
      return `***${lastFour}`;
    });
  }

  // Remove email addresses
  if (opts.removeEmails) {
    sanitized = sanitized.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]');
  }

  // Remove phone numbers
  if (opts.removePhoneNumbers) {
    sanitized = sanitized.replace(/(?:\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[PHONE]');
  }

  // Sanitize addresses
  if (opts.sanitizeAddresses) {
    sanitized = sanitized.replace(/\b\d{1,5}\s+[A-Za-z\s]+(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Circle|Cir)\b/gi, '[ADDRESS]');
  }

  return sanitized;
}

/**
 * Validates that a masked account number is properly formatted
 */
export function validateMaskedAccountNumber(value: any): string | undefined {
  if (value === null || value === undefined) return undefined;

  // Normalize any provided value into a string and extract digits only
  const digitsOnly = String(value).match(/\d/g)?.join('') || '';

  // Require at least 3 digits to form a safe mask; otherwise skip
  if (digitsOnly.length >= 3) {
    const last3 = digitsOnly.slice(-3);
    // Always return canonical "Ending in XXX" with only last 3 digits
    return `Ending in ${last3}`;
  }

  // No sufficient digits to safely represent; omit instead of logging raw input
  return undefined;
}

/**
 * Sanitizes transaction data for AI classification
 */
export interface SanitizedTransactionData {
  description: string;
  amount: number;
  date: string;
}

export function sanitizeTransactionForAI(
  transactionText: string,
  amount: number,
  date: string,
  options: SanitizationOptions = {}
): SanitizedTransactionData {
  return {
    description: sanitizeTransactionDescription(transactionText, options),
    amount: sanitizeTransactionAmount(amount, options),
    date: date // Dates are generally okay - they help with context
  };
}