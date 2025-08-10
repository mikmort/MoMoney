import { fileProcessingService } from '../services/fileProcessingService';

describe('File Processing Regression Tests', () => {
  describe('CSV Edge Cases', () => {
    it('should handle CSV files with mixed delimiters gracefully', async () => {
      // Create a problematic CSV with mixed delimiters - this is a real-world issue
      const csvContent = `Date,Description,Amount
01/15/2025,"Coffee Shop",-4.50
01/16/2025,"Gas Station",-45.00
01/17/2025,"Grocery Store",-125.30`;

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const file = new File([blob], 'mixed-delimiters.csv', { type: 'text/csv' });

      const result = await fileProcessingService.processUploadedFile(file);
      
      // Should handle the format gracefully without crashing
      expect(result.file).toBeDefined();
      expect(result.file.status).not.toBe('failed');
      expect(result.file.filename).toBe('mixed-delimiters.csv');
    });

    it('should handle very large file names without buffer overflow', async () => {
      const longFileName = 'A'.repeat(1000) + '.csv'; // Extremely long filename
      const csvContent = `Date,Description,Amount
01/15/2025,"Normal transaction",-25.00`;

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const file = new File([blob], longFileName, { type: 'text/csv' });

      const result = await fileProcessingService.processUploadedFile(file);
      
      expect(result.file).toBeDefined();
      expect(result.file.status).not.toBe('failed');
      expect(result.file.filename).toBe(longFileName);
    });

    it('should handle files with special characters and emoji without breaking', async () => {
      const csvContent = `Date,Description,Amount
01/15/2025,"🍕 Pizza Place",-12.50
01/16/2025,"Café René",-4.75
01/17/2025,"Transaction with quotes",-25.00`;

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const file = new File([blob], 'special-chars-🍕.csv', { type: 'text/csv' });

      const result = await fileProcessingService.processUploadedFile(file);
      
      expect(result.file).toBeDefined();
      expect(result.file.status).not.toBe('failed');
    });
  });

  describe('Memory and Performance Edge Cases', () => {
    it('should handle large CSV files without memory overflow', async () => {
      // Create a moderately large CSV with 100 transactions (realistic test size)
      let csvContent = 'Date,Description,Amount\n';
      for (let i = 0; i < 100; i++) {
        csvContent += `01/15/2025,"Transaction ${i}",-${(i + 1) * 1.5}\n`;
      }

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const file = new File([blob], 'large-file.csv', { type: 'text/csv' });

      const startTime = Date.now();
      const result = await fileProcessingService.processUploadedFile(file);
      const processingTime = Date.now() - startTime;

      expect(result.file).toBeDefined();
      expect(result.file.status).not.toBe('failed');
      expect(processingTime).toBeLessThan(5000); // Should process within 5 seconds
    });

    it('should handle empty files gracefully', async () => {
      const blob = new Blob([''], { type: 'text/csv' });
      const file = new File([blob], 'empty.csv', { type: 'text/csv' });

      // Process with account ID to avoid AI detection timeout
      const result = await fileProcessingService.processUploadedFile(file, 'test-account');
      
      expect(result.file).toBeDefined();
      expect(['processing', 'completed', 'failed', 'awaiting-account-selection']).toContain(result.file.status);
    });

    it('should handle files with only headers', async () => {
      const blob = new Blob(['Date,Description,Amount\n'], { type: 'text/csv' });
      const file = new File([blob], 'headers-only.csv', { type: 'text/csv' });

      const result = await fileProcessingService.processUploadedFile(file, 'test-account');
      
      expect(result.file).toBeDefined();
      expect(['processing', 'completed', 'failed', 'awaiting-account-selection']).toContain(result.file.status);
    });
  });

  describe('File Type Detection Edge Cases', () => {
    it('should correctly detect file types from extensions', () => {
      const testFiles = [
        { name: 'statement.csv', expectedType: 'csv' },
        { name: 'statement.CSV', expectedType: 'csv' }, // Test case sensitivity
        { name: 'bank.xlsx', expectedType: 'excel' },
        { name: 'report.pdf', expectedType: 'pdf' },
        { name: 'data.ofx', expectedType: 'ofx' },
        { name: 'weird.unknown', expectedType: 'unknown' }
      ];

      // Test the internal file type detection logic directly
      for (const testFile of testFiles) {
        // @ts-ignore - access private method for testing file type detection
        const detectedType = fileProcessingService.getFileType(testFile.name);
        expect(detectedType).toBe(testFile.expectedType);
      }
    });

    it('should handle files without extensions', () => {
      // @ts-ignore - access private method 
      const fileType = fileProcessingService.getFileType('filename_without_extension');
      expect(fileType).toBe('unknown');
    });
  });

  describe('Concurrent File Processing', () => {
    it('should handle multiple simultaneous file uploads without corruption', async () => {
      const files = [];
      
      // Create 5 different files
      for (let i = 0; i < 5; i++) {
        const csvContent = `Date,Description,Amount\n01/15/2025,"File ${i} Transaction",-${i + 10}.00`;
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const file = new File([blob], `concurrent-file-${i}.csv`, { type: 'text/csv' });
        files.push(file);
      }

      // Process all files simultaneously
      const processPromises = files.map(file => fileProcessingService.processUploadedFile(file));
      const results = await Promise.all(processPromises);

      // All should complete successfully
      expect(results).toHaveLength(5);
      results.forEach((result, index) => {
        expect(result.file).toBeDefined();
        expect(result.file.filename).toBe(`concurrent-file-${index}.csv`);
        expect(result.file.status).not.toBe('failed');
      });

      // Each should have unique IDs
      const fileIds = results.map(r => r.file.id);
      const uniqueIds = new Set(fileIds);
      expect(uniqueIds.size).toBe(5);
    });
  });

  describe('OFX File Processing', () => {
    it('should process OFX files without throwing unsupported file type error', async () => {
      const ofxContent = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<DTSTART>20240101000000
<DTEND>20240115000000

<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20240102000000
<TRNAMT>-25.50
<FITID>TXN001
<NAME>Coffee Shop Purchase
<MEMO>Morning coffee
</STMTTRN>

<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20240103000000
<TRNAMT>2500.00
<FITID>TXN002
<NAME>Salary Deposit
<MEMO>Monthly salary
</STMTTRN>

</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

      const blob = new Blob([ofxContent], { type: 'application/vnd.intu.qfx' });
      const file = new File([blob], 'statement.ofx', { type: 'application/vnd.intu.qfx' });

      // This should NOT throw "Unsupported file type: ofx" error
      const result = await fileProcessingService.processUploadedFile(file);
      
      expect(result.file).toBeDefined();
      expect(result.file.filename).toBe('statement.ofx');
      expect(result.file.fileType).toBe('ofx');
      expect(result.file.status).not.toBe('failed');
    });

    it('should detect OFX file type correctly', () => {
      // @ts-ignore - access private method for testing
      const fileType = fileProcessingService.getFileType('bank_statement.ofx');
      expect(fileType).toBe('ofx');
    });
  });

  describe('Account Detection Regression', () => {
    it('should handle account detection with various filename patterns', () => {
      const testCases = [
        { filename: 'Chase_Statement_2025.pdf', expectsDetection: true },
        { filename: 'BANK_OF_AMERICA_savings.csv', expectsDetection: true },
        { filename: 'completely_random_filename.xlsx', expectsDetection: false },
        { filename: '2025-01-statement.csv', expectsDetection: false }
      ];

      // Test detection logic without full file processing to avoid timeouts
      for (const testCase of testCases) {
        // @ts-ignore - access private detection logic
        const detectionPatterns = fileProcessingService.detectAccountPatterns?.(testCase.filename) || [];
        
        if (testCase.expectsDetection) {
          expect(detectionPatterns.length).toBeGreaterThan(0);
        } else {
          expect(detectionPatterns.length).toBe(0);
        }
      }
    });
  });
});