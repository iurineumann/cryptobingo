import { AuditLog } from '../models/AuditLog';

export interface AuditEntry {
  actor: string;
  action: string;
  target: string;
  details?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await AuditLog.create({
      actor: entry.actor,
      action: entry.action,
      target: entry.target,
      details: entry.details ?? {},
      ip: entry.ip ?? '',
      userAgent: entry.userAgent ?? '',
    });
  } catch (err) {
    console.error('[Audit] Falha ao registrar:', entry.action, err);
  }
}
