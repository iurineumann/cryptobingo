jest.mock('../_lib/db.js', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
}));

import {
  saveNewsletter,
  getNewsletters,
  getNewsletterRecipients,
  recordNewsletterSend,
  updateNewsletterSentCount,
  getPendingRecipients,
  getNewsletterById,
} from '../_lib/models.js';

const db = jest.requireMock('../_lib/db.js');

beforeEach(() => {
  db.query.mockReset();
  db.queryOne.mockReset();
});

describe('saveNewsletter', () => {
  it('deve inserir newsletter e retornar id', async () => {
    db.queryOne.mockResolvedValue({ id: 42 });
    const id = await saveNewsletter('Subject', 'Body');
    expect(id).toBe(42);
    expect(db.queryOne).toHaveBeenCalledTimes(1);
    const [sql, params] = db.queryOne.mock.calls[0];
    expect(sql).toContain('INSERT INTO newsletters');
    expect(params).toEqual(['Subject', 'Body']);
  });

  it('deve lançar erro se falhar inserção', async () => {
    db.queryOne.mockResolvedValue(null);
    await expect(saveNewsletter('S', 'B')).rejects.toThrow('Failed to save newsletter');
  });
});

describe('getNewsletters', () => {
  it('deve retornar lista ordenada por sent_at desc', async () => {
    const rows = [
      { id: 2, subject: 'Second', body: 'B2', created_at: '2026-01-02', sent_at: '2026-01-02', sent_count: 10 },
      { id: 1, subject: 'First', body: 'B1', created_at: '2026-01-01', sent_at: null, sent_count: 0 },
    ];
    db.query.mockResolvedValue(rows);
    const result = await getNewsletters();
    expect(result).toEqual(rows);
    expect(db.query.mock.calls[0][0]).toContain('ORDER BY sent_at DESC NULLS LAST');
  });
});

describe('getNewsletterRecipients', () => {
  it('deve retornar recipients com received=true/false', async () => {
    const rows = [
      { email: 'a@test.com', token: 'tok1', received: true },
      { email: 'b@test.com', token: 'tok2', received: false },
    ];
    db.query.mockResolvedValue(rows);
    const result = await getNewsletterRecipients(1);
    expect(result).toEqual(rows);
    expect(db.query.mock.calls[0][1]).toEqual([1]);
  });
});

describe('recordNewsletterSend', () => {
  it('deve inserir com ON CONFLICT', async () => {
    db.query.mockResolvedValue({ rowCount: 1 });
    await recordNewsletterSend(1, 'a@test.com', 'tok1', 'sent');
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO newsletter_sends');
    expect(sql).toContain('ON CONFLICT');
    expect(params).toEqual([1, 'a@test.com', 'tok1', 'sent']);
  });
});

describe('updateNewsletterSentCount', () => {
  it('deve atualizar sent_count', async () => {
    db.query.mockResolvedValue({ rowCount: 1 });
    await updateNewsletterSentCount(1, 5);
    expect(db.query.mock.calls[0][1]).toEqual([5, 1]);
  });
});

describe('getPendingRecipients', () => {
  it('deve retornar assinantes sem registro de envio', async () => {
    const rows = [
      { email: 'c@test.com', token: 'tok3' },
    ];
    db.query.mockResolvedValue(rows);
    const result = await getPendingRecipients(1);
    expect(result).toEqual(rows);
    expect(db.query.mock.calls[0][0]).toContain('NOT EXISTS');
    expect(db.query.mock.calls[0][1]).toEqual([1]);
  });
});

describe('getNewsletterById', () => {
  it('deve retornar newsletter por id', async () => {
    const row = { id: 1, subject: 'S', body: 'B', created_at: '2026-01-01', sent_at: null, sent_count: 0 };
    db.queryOne.mockResolvedValue(row);
    const result = await getNewsletterById(1);
    expect(result).toEqual(row);
    expect(db.queryOne.mock.calls[0][1]).toEqual([1]);
  });

  it('deve retornar null se não existir', async () => {
    db.queryOne.mockResolvedValue(null);
    const result = await getNewsletterById(999);
    expect(result).toBeNull();
  });
});
