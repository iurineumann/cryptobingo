import { describe, it, expect, jest } from '@jest/globals';

describe('logger', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('deve exportar uma instância pino com level info por padrão', () => {
    delete process.env.LOG_LEVEL;
    const { logger } = require('../logger');
    expect(logger).toBeDefined();
    expect(logger.level).toBe('info');
  });

  it('deve respeitar LOG_LEVEL environment', () => {
    process.env.LOG_LEVEL = 'debug';
    const { logger } = require('../logger');
    expect(logger.level).toBe('debug');
  });
});
