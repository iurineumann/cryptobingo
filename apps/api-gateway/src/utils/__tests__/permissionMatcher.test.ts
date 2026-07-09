import { describe, it, expect } from '@jest/globals';
import { hasPermission, matchPermission } from '../permissionMatcher';

describe('matchPermission', () => {
  it('coringa * casa qualquer segmento', () => {
    expect(matchPermission('admin.*', 'admin.users.manage')).toBe(true);
  });

  it('correspondencia exata funciona', () => {
    expect(matchPermission('admin.users', 'admin.users')).toBe(true);
  });

  it('prefixo maior que permissao retorna false', () => {
    expect(matchPermission('admin.users.manage', 'admin.users')).toBe(false);
  });

  it('segmento diferente retorna false', () => {
    expect(matchPermission('admin.users', 'admin.rooms')).toBe(false);
  });
});

describe('hasPermission', () => {
  it('retorna true se userPermissions e null/undefined (bypass)', () => {
    expect(hasPermission(null, 'admin.users')).toBe(true);
    expect(hasPermission(undefined, 'admin.users')).toBe(true);
  });

  it('retorna true se algum padrao casa', () => {
    expect(hasPermission(['admin.*', 'content.read'], 'admin.users.manage')).toBe(true);
  });

  it('retorna false se nenhum padrao casa', () => {
    expect(hasPermission(['content.read'], 'admin.users')).toBe(false);
  });

  it('coringa * funciona via hasPermission', () => {
    expect(hasPermission(['*'], 'qualquer.coisa.aqui')).toBe(true);
  });
});
