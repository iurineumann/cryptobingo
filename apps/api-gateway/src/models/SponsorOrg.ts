import { Schema, model, Document } from 'mongoose';

export interface ISponsorOrg extends Document {
  orgId: string;
  owner_wallet: string;
  name: string;
  settings: {
    autoApproveDelegations: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

const SponsorOrgSchema = new Schema<ISponsorOrg>(
  {
    orgId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    owner_wallet: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      default: '',
    },
    settings: {
      autoApproveDelegations: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

export const SponsorOrg = model<ISponsorOrg>('SponsorOrg', SponsorOrgSchema);
