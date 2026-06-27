import { Schema, model, Document } from 'mongoose';

export interface ISponsorDelegation extends Document {
  orgId: string;
  wallet_address: string;
  permissions: string[];
  delegated_by: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SponsorDelegationSchema = new Schema<ISponsorDelegation>(
  {
    orgId: {
      type: String,
      required: true,
      index: true,
    },
    wallet_address: {
      type: String,
      required: true,
      index: true,
    },
    permissions: {
      type: [String],
      default: [],
    },
    delegated_by: {
      type: String,
      required: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

SponsorDelegationSchema.index({ orgId: 1, wallet_address: 1 }, { unique: true });

export const SponsorDelegation = model<ISponsorDelegation>(
  'SponsorDelegation',
  SponsorDelegationSchema
);
