import { fileProcessingService } from '../services/fileProcessingService';

describe('Debug OFX Import Issue', () => {
  test('should process OFX file end-to-end', async () => {
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
    const file = new File([blob], 'test.ofx', { type: 'application/vnd.intu.qfx' });

    console.log('🔍 Starting OFX file processing...');
    
    const result = await fileProcessingService.processUploadedFile(file, 'test-account');
    
    console.log('📄 File processed:', {
      status: result.file.status,
      fileType: result.file.fileType,
      transactionCount: result.file.transactionCount,
      hasTransactions: !!result.transactions,
      transactionArrayLength: result.transactions?.length
    });

    expect(result.file).toBeDefined();
    expect(result.file.fileType).toBe('ofx');
    
    if (result.file.status === 'error') {
      console.error('❌ Processing failed with error:', result.file.errorMessage);
      fail(`OFX processing failed: ${result.file.errorMessage}`);
    }
    
    expect(result.transactions).toBeDefined();
    expect(result.transactions?.length).toBeGreaterThan(0);
    
    const transaction = result.transactions![0];
    console.log('📊 Sample transaction:', transaction);
    
    expect(transaction.description).toBeTruthy();
    expect(transaction.amount).toBeTruthy();
    expect(transaction.date).toBeTruthy();
  });
  
  test('should handle OFX parsing directly', async () => {
    const ofxContent = `<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20240102000000
<TRNAMT>-25.50
<FITID>TXN001
<NAME>Test Transaction
<MEMO>Test memo
</STMTTRN>`;

    // @ts-ignore - accessing private method for debugging
    const transactions = await fileProcessingService.parseOFX(ofxContent, {
      hasHeaders: false,
      skipRows: 0,
      dateFormat: 'YYYYMMDD',
      amountFormat: 'negative for debits',
      dateColumn: 'date',
      descriptionColumn: 'description',
      amountColumn: 'amount'
    });
    
    console.log('🔧 Direct OFX parsing result:', transactions);
    
    expect(transactions).toBeDefined();
    expect(Array.isArray(transactions)).toBe(true);
    expect(transactions.length).toBe(1);
    
    if (transactions.length > 0) {
      const tx = transactions[0];
      expect(tx.description).toBe('Test Transaction');
      expect(tx.amount).toBe(-25.50);
      expect(tx.date).toBe('20240102000000');
    }
  });
});