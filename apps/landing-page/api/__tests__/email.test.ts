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

describe('renderNewsletterHtml', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    process.env.UNSUBSCRIBE_BASE = 'https://landing-api.cryptobingo.bet/api/subscribe';
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  function load() {
    return require('../_lib/email.js') as typeof import('../_lib/email.js');
  }

  it('deve conter unsubscribe_link com token quando token presente', () => {
    const { renderNewsletterHtml } = load();
    const html = renderNewsletterHtml('Assunto', 'Corpo', 'abc123');
    expect(html).toContain('token=abc123');
    expect(html).not.toContain('cryptobingo.bet/home');
  });

  it('deve usar unsubscribeBase sem token quando token ausente (nunca fallback home)', () => {
    const { renderNewsletterHtml } = load();
    const html = renderNewsletterHtml('Assunto', 'Corpo');
    expect(html).toContain('/api/subscribe');
    expect(html).not.toContain('token=');
    expect(html).not.toContain('cryptobingo.bet/home');
  });

  it('deve conter preheader no hidden div', () => {
    const { renderNewsletterHtml } = load();
    const html = renderNewsletterHtml('S', 'B', 'tok', 'Preview text');
    expect(html).toContain('Preview text');
  });

  it('deve renderizar preheader vazio quando omitido', () => {
    const { renderNewsletterHtml } = load();
    const html = renderNewsletterHtml('S', 'B', 'tok');
    expect(html).not.toContain('{{preheader}}');
    expect(html).toContain('mso-hide:all;');
  });

  it('deve converter body em paragrafos escapados', () => {
    const { renderNewsletterHtml } = load();
    const html = renderNewsletterHtml('S', 'Linha1\n\nLinha2', 'tok');
    expect(html).toContain('<p');
    expect(html).toContain('Linha1');
    expect(html).toContain('Linha2');
  });

  it('deve escapar HTML no subject e body', () => {
    const { renderNewsletterHtml } = load();
    const html = renderNewsletterHtml('<script>alert("xss")</script>', 'Body <b>teste</b>', 'tok');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;teste&lt;/b&gt;');
    expect(html).not.toContain('<script>');
  });

  it('deve conter ano e data no rodapé', () => {
    const { renderNewsletterHtml } = load();
    const html = renderNewsletterHtml('S', 'B', 'tok');
    const year = String(new Date().getFullYear());
    expect(html).toContain(year);
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
