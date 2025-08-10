import { fileProcessingService } from '../services/fileProcessingService';

describe('OFX File Processing', () => {
  // Sample OFX content for testing
  const sampleOFXContent = `
OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<DTSERVER>20240801120000
<LANGUAGE>ENG
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<STMTRS>
<CURDEF>USD
<BANKACCTFROM>
<BANKID>123456789
<ACCTID>987654321
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20240701120000
<DTEND>20240801120000
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20240715120000
<TRNAMT>-50.25
<FITID>T001
<NAME>GROCERY STORE PURCHASE
<MEMO>Weekly groceries
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20240720120000
<TRNAMT>2500.00
<FITID>T002
<NAME>SALARY DEPOSIT
<MEMO>Monthly salary
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20240725120000
<TRNAMT>-125.50
<FITID>T003
<NAME>UTILITY BILL PAYMENT
<MEMO>Electric bill
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>2324.25
<DTASOF>20240801120000
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

  test('should correctly identify OFX file type', () => {
    // @ts-ignore - accessing private method for testing
    const fileType = fileProcessingService.getFileType('statement.ofx');
    expect(fileType).toBe('ofx');
  });

  test('should parse OFX transactions correctly', async () => {
    // Test the OFX parser directly with the content string
    // @ts-ignore - accessing private method for testing
    const transactions = await fileProcessingService.parseOFX(sampleOFXContent, {
      hasHeaders: false,
      skipRows: 0,
      dateFormat: 'YYYYMMDD',
      amountFormat: 'negative for debits',
      dateColumn: 'date',
      descriptionColumn: 'description',
      amountColumn: 'amount'
    });

    expect(transactions).toBeDefined();
    expect(transactions.length).toBe(3);
    
    // Test first transaction (grocery purchase)
    expect(transactions[0].description).toBe('GROCERY STORE PURCHASE');
    expect(transactions[0].amount).toBe(-50.25);
    expect(transactions[0].date).toBe('20240715120000');
    expect(transactions[0].notes).toBe('Weekly groceries');
    expect(transactions[0].transactionId).toBe('T001');

    // Test second transaction (salary)
    expect(transactions[1].description).toBe('SALARY DEPOSIT');
    expect(transactions[1].amount).toBe(2500.00);
    expect(transactions[1].date).toBe('20240720120000');
    expect(transactions[1].notes).toBe('Monthly salary');

    // Test third transaction (utility bill)
    expect(transactions[2].description).toBe('UTILITY BILL PAYMENT');
    expect(transactions[2].amount).toBe(-125.50);
    expect(transactions[2].date).toBe('20240725120000');
    expect(transactions[2].notes).toBe('Electric bill');
  });

  test('should handle empty or malformed OFX content', async () => {
    // @ts-ignore - accessing private method for testing
    const transactions = await fileProcessingService.parseOFX('', {
      hasHeaders: false,
      skipRows: 0,
      dateFormat: 'YYYYMMDD',
      amountFormat: 'negative for debits',
      dateColumn: 'date',
      descriptionColumn: 'description',
      amountColumn: 'amount'
    });

    expect(transactions).toBeDefined();
    expect(transactions.length).toBe(0);
  });

  test('should extract OFX values correctly', () => {
    const sampleBlock = `
<TRNTYPE>DEBIT
<DTPOSTED>20240715120000
<TRNAMT>-50.25
<FITID>T001
<NAME>GROCERY STORE PURCHASE
<MEMO>Weekly groceries
`;

    // @ts-ignore - accessing private method for testing
    expect(fileProcessingService.extractOFXValue(sampleBlock, 'TRNTYPE')).toBe('DEBIT');
    // @ts-ignore - accessing private method for testing
    expect(fileProcessingService.extractOFXValue(sampleBlock, 'DTPOSTED')).toBe('20240715120000');
    // @ts-ignore - accessing private method for testing
    expect(fileProcessingService.extractOFXValue(sampleBlock, 'TRNAMT')).toBe('-50.25');
    // @ts-ignore - accessing private method for testing
    expect(fileProcessingService.extractOFXValue(sampleBlock, 'NAME')).toBe('GROCERY STORE PURCHASE');
    // @ts-ignore - accessing private method for testing
    expect(fileProcessingService.extractOFXValue(sampleBlock, 'MEMO')).toBe('Weekly groceries');
    // @ts-ignore - accessing private method for testing
    expect(fileProcessingService.extractOFXValue(sampleBlock, 'NONEXISTENT')).toBeNull();
  });

  test('should provide appropriate default schema mapping for OFX files', () => {
    // @ts-ignore - accessing private method for testing
    const mapping = fileProcessingService.getDefaultSchemaMapping('ofx');
    
    expect(mapping.mapping.hasHeaders).toBe(false);
    expect(mapping.mapping.dateFormat).toBe('YYYYMMDD');
    expect(mapping.mapping.dateColumn).toBe('date');
    expect(mapping.mapping.descriptionColumn).toBe('description');
    expect(mapping.mapping.amountColumn).toBe('amount');
    expect(mapping.confidence).toBe(0.9); // High confidence for structured format
    expect(mapping.reasoning).toContain('OFX structure mapping');
  });
});