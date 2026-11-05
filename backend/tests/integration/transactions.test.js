import request from 'supertest';
import app from '../../src/app.js';
import { cleanDatabase, seedTestFixtures, testPool } from '../helpers/testDb.js';

describe('Financial Transactions & Money Conservation Tests', () => {
  let fixtures;

  beforeEach(async () => {
    await cleanDatabase();
    fixtures = await seedTestFixtures();
  });

  afterAll(async () => {
    await testPool.end();
  });

  test('Deposit - Successfully credits account and updates balance in PostgreSQL', async () => {
    const res = await request(app)
      .post('/api/v1/transactions/deposit')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .send({
        accountId: fixtures.aliceAccount.id,
        amount: '50.00', // 5,000 paise
        description: 'Cheque deposit',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.amountPaise).toBe('5000');
    expect(res.body.data.balanceAfterPaise).toBe('15000'); // Initial was 10000 + 5000 = 15000

    // Direct Database Verification
    const dbAcc = await testPool.query('SELECT balance FROM accounts WHERE id = $1', [fixtures.aliceAccount.id]);
    expect(dbAcc.rows[0].balance).toBe(15000n);

    // Verify Ledger Entry
    const dbLedger = await testPool.query(
      'SELECT entry_type, amount, balance_after FROM ledger_entries WHERE account_id = $1 ORDER BY created_at DESC LIMIT 1',
      [fixtures.aliceAccount.id]
    );
    expect(dbLedger.rows[0].entry_type).toBe('CREDIT');
    expect(dbLedger.rows[0].amount).toBe(5000n);
    expect(dbLedger.rows[0].balance_after).toBe(15000n);
  });

  test('Withdrawal - Successfully debits account and verifies balance in PostgreSQL', async () => {
    const res = await request(app)
      .post('/api/v1/transactions/withdraw')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .send({
        accountId: fixtures.aliceAccount.id,
        amount: '30.00', // 3,000 paise
        description: 'ATM Cash Withdrawal',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.balanceAfterPaise).toBe('7000'); // 10000 - 3000 = 7000

    // Direct Database Verification
    const dbAcc = await testPool.query('SELECT balance FROM accounts WHERE id = $1', [fixtures.aliceAccount.id]);
    expect(dbAcc.rows[0].balance).toBe(7000n);

    const dbLedger = await testPool.query(
      'SELECT entry_type, amount, balance_after FROM ledger_entries WHERE account_id = $1 ORDER BY created_at DESC LIMIT 1',
      [fixtures.aliceAccount.id]
    );
    expect(dbLedger.rows[0].entry_type).toBe('DEBIT');
    expect(dbLedger.rows[0].amount).toBe(3000n);
    expect(dbLedger.rows[0].balance_after).toBe(7000n);
  });

  test('Withdrawal - Rejects withdrawal exceeding available balance (overdraft protection)', async () => {
    const res = await request(app)
      .post('/api/v1/transactions/withdraw')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .send({
        accountId: fixtures.aliceAccount.id,
        amount: '150.00', // 15,000 paise > available 10,000 paise
        description: 'Excessive withdrawal',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Insufficient funds/i);

    // Verify balance was untouched
    const dbAcc = await testPool.query('SELECT balance FROM accounts WHERE id = $1', [fixtures.aliceAccount.id]);
    expect(dbAcc.rows[0].balance).toBe(10000n);
  });

  test('Internal Transfer - Money Conservation: Moves funds with balanced double-entry postings', async () => {
    // Record total system balance before transfer
    const beforeTotalRes = await testPool.query('SELECT SUM(balance) as total FROM accounts;');
    const beforeTotal = BigInt(beforeTotalRes.rows[0].total);

    const transferAmountPaise = 4000n; // ₹40.00

    const res = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .send({
        sourceAccountId: fixtures.aliceAccount.id,
        destinationAccountId: fixtures.bobAccount.id,
        amount: '40.00',
        description: 'Payment for groceries',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sourceBalanceAfterPaise).toBe('6000'); // 10000 - 4000 = 6000
    expect(res.body.data.destinationBalanceAfterPaise).toBe('9000'); // 5000 + 4000 = 9000

    // INVARIANT 1: Total system balance is strictly conserved!
    const afterTotalRes = await testPool.query('SELECT SUM(balance) as total FROM accounts;');
    const afterTotal = BigInt(afterTotalRes.rows[0].total);
    expect(afterTotal).toBe(beforeTotal);

    // INVARIANT 2: Both accounts updated accurately in PostgreSQL
    const aliceDb = await testPool.query('SELECT balance FROM accounts WHERE id = $1', [fixtures.aliceAccount.id]);
    const bobDb = await testPool.query('SELECT balance FROM accounts WHERE id = $1', [fixtures.bobAccount.id]);
    expect(aliceDb.rows[0].balance).toBe(6000n);
    expect(bobDb.rows[0].balance).toBe(9000n);

    // INVARIANT 3: Exactly two balanced double-entry ledger postings exist for this transaction
    const txnId = res.body.data.transactionId;
    const ledgerRows = await testPool.query(
      'SELECT account_id, entry_type, amount, balance_after FROM ledger_entries WHERE transaction_id = $1 ORDER BY entry_type DESC',
      [txnId]
    );

    expect(ledgerRows.rows).toHaveLength(2);
    const debit = ledgerRows.rows.find((r) => r.entry_type === 'DEBIT');
    const credit = ledgerRows.rows.find((r) => r.entry_type === 'CREDIT');

    expect(debit.account_id).toBe(fixtures.aliceAccount.id);
    expect(debit.amount).toBe(transferAmountPaise);
    expect(debit.balance_after).toBe(6000n);

    expect(credit.account_id).toBe(fixtures.bobAccount.id);
    expect(credit.amount).toBe(transferAmountPaise);
    expect(credit.balance_after).toBe(9000n);

    // Invariant: Debit amount equals Credit amount
    expect(debit.amount).toBe(credit.amount);
  });
});

