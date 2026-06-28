import { describe, it, expect } from '@jest/globals';
import { hasPermission } from '../permissionMatcher';

describe('permissionMatcher', () => {
  describe('hasPermission', () => {
    it('deve casar exato: admin.users.manage === admin.users.manage', () => {
      expect(hasPermission(['admin.users.manage'], 'admin.users.manage')).toBe(true);
    });

    it('deve casar wildcard: admin.* casa admin.users.manage', () => {
      expect(hasPermission(['admin.*'], 'admin.users.manage')).toBe(true);
    });

    it('deve casar wildcard: admin.* casa admin.dashboard.view', () => {
      expect(hasPermission(['admin.*'], 'admin.dashboard.view')).toBe(true);
    });

    it('deve casar sponsor wildcard: sponsor.org_abc.* casa sponsor.org_abc.rooms.manage', () => {
      expect(hasPermission(['sponsor.org_abc.*'], 'sponsor.org_abc.rooms.manage')).toBe(true);
    });

    it('deve casar sponsor wildcard segundo nível: sponsor.*.treasury.view casa sponsor.org_abc.treasury.view', () => {
      expect(hasPermission(['sponsor.*.treasury.view'], 'sponsor.org_abc.treasury.view')).toBe(true);
    });

    it('deve NÃO casar quando namespace diferente', () => {
      expect(hasPermission(['admin.users.manage'], 'admin.rooms.manage')).toBe(false);
    });

    it('deve NÃO casar quando orgId diferente', () => {
      expect(hasPermission(['sponsor.org_abc.rooms.manage'], 'sponsor.org_xyz.rooms.manage')).toBe(false);
    });

    it('deve NÃO casar wildcard admin.* contra sponsor.*', () => {
      expect(hasPermission(['admin.*'], 'sponsor.org_abc.dashboard.view')).toBe(false);
    });

    it('deve aceitar array vazio como false', () => {
      expect(hasPermission([], 'admin.users.manage')).toBe(false);
    });

    it('deve aceitar multiplas perms: qualquer uma casa', () => {
      expect(hasPermission(
        ['admin.rooms.manage', 'admin.users.manage'],
        'admin.users.manage'
      )).toBe(true);
    });

    it('deve casar contract_admin como bypass (lista null)', () => {
      expect(hasPermission(null, 'admin.users.manage')).toBe(true);
    });
  });
});
