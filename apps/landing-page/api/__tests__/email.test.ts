jest.mock('../_lib/db.js', () => ({
  query: jest.fn(),
}));

import { logEmail } from '../_lib/email.js';

const db = jest.requireMock('../_lib/db.js');

beforeEach(() => {
  db.query.mockReset();
});

describe('logEmail', () => {
  it('deve inserir com colunas corretas e status default sent', async () => {
    db.query.mockResolvedValue({ rowCount: 1 });

    await logEmail('user@test.com', 'Assunto', 'welcome');

    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('to_email');
    expect(sql).toContain('subject');
    expect(sql).toContain('purpose');
    expect(sql).toContain('status');
    expect(sql).toContain('error_msg');
    expect(params).toEqual(['user@test.com', 'Assunto', 'welcome', 'sent', null]);
  });

  it('deve inserir com status failed e errorMsg', async () => {
    db.query.mockResolvedValue({ rowCount: 1 });

    await logEmail('user@test.com', 'Assunto', 'welcome', 'failed', 'Connection refused');

    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(params).toEqual(['user@test.com', 'Assunto', 'welcome', 'failed', 'Connection refused']);
  });
});

describe('sendMessage / sendWelcome', () => {
  function setupEnv() {
    process.env.SMTP_HOST = 'smtp.test.com';
    process.env.SMTP_USER = 'test@test.com';
    process.env.SMTP_PASS = 'secret';
    process.env.SMTP_SENDER = 'sender@test.com';
  }

  it('deve chamar logEmail com status=failed quando sendMail falha', async () => {
    jest.resetModules();
    setupEnv();

    const mockSendMail = jest.fn().mockRejectedValue(new Error('SMTP connection error'));

    jest.doMock('nodemailer', () => ({
      createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
    }));

    const dbMock = jest.requireMock<{ query: jest.Mock }>('../_lib/db.js');
    dbMock.query.mockResolvedValue({ rowCount: 1 });

    const { sendWelcome: sw } = await import('../_lib/email.js');

    await expect(sw('user@test.com')).rejects.toThrow('SMTP connection error');

    expect(dbMock.query).toHaveBeenCalled();
    expect(dbMock.query.mock.calls[0][0]).toContain('email_log');
    expect(dbMock.query.mock.calls[0][1]).toEqual([
      'user@test.com', 'Welcome to CryptoBingo!', 'welcome', 'failed', 'SMTP connection error',
    ]);
  });

  it('deve chamar logEmail com status=sent quando sendMail sucede', async () => {
    jest.resetModules();
    setupEnv();

    const mockSendMail = jest.fn().mockResolvedValue({ accepted: ['user@test.com'] });

    jest.doMock('nodemailer', () => ({
      createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
    }));

    const dbMock = jest.requireMock<{ query: jest.Mock }>('../_lib/db.js');
    dbMock.query.mockResolvedValue({ rowCount: 1 });

    const { sendWelcome: sw } = await import('../_lib/email.js');

    await sw('user@test.com');

    expect(dbMock.query).toHaveBeenCalled();
    expect(dbMock.query.mock.calls[0][0]).toContain('email_log');
    expect(dbMock.query.mock.calls[0][1]).toEqual([
      'user@test.com', 'Welcome to CryptoBingo!', 'welcome', 'sent', null,
    ]);
  });
});
