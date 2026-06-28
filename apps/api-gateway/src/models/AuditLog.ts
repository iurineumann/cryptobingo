import { Schema, model, Document } from 'mongoose';

export interface IAuditLog extends Document {
  actor: string;
  action: string;
  target: string;
  details: Record<string, unknown>;
  ip: string;
  userAgent: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    actor:    { type: String, required: true, index: true },
    action:   { type: String, required: true, index: true },
    target:   { type: String, required: true, index: true },
    details:  { type: Schema.Types.Mixed, default: {} },
    ip:       { type: String, default: '' },
    userAgent:{ type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ createdAt: -1 });

export const AuditLog = model<IAuditLog>('AuditLog', AuditLogSchema);
