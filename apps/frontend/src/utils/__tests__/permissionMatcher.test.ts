import { describe, it, expect } from 'vitest';
import { hasPermission } from '../permissionMatcher';

describe('permissionMatcher (frontend)', () => {
  it('deve casar exato', () => {
    expect(hasPermission(['admin.users.manage'], 'admin.users.manage')).toBe(true);
  });
  it('deve casar wildcard admin.*', () => {
    expect(hasPermission(['admin.*'], 'admin.users.manage')).toBe(true);
  });
  it('deve NÃO casar namespace diferente', () => {
    expect(hasPermission(['admin.users.manage'], 'admin.rooms.manage')).toBe(false);
  });
  it('deve passar com null/undefined (bypass)', () => {
    expect(hasPermission(null, 'admin.users.manage')).toBe(true);
    expect(hasPermission(undefined, 'admin.users.manage')).toBe(true);
  });
});
