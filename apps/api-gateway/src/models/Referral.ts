import mongoose, { Schema, Document } from "mongoose";

export interface IReferral extends Document {
  wallet: string;
  referralCode: string;
  referred: string[];
  rewards: {
    xpAwarded: number;
    ticketsAwarded: number;
  };
  createdAt: Date;
}

const ReferralSchema = new Schema<IReferral>(
  {
    wallet: { type: String, required: true },
    referralCode: { type: String, required: true, unique: true },
    referred: [{ type: String }],
    rewards: {
      xpAwarded: { type: Number, default: 0 },
      ticketsAwarded: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

ReferralSchema.index({ referralCode: 1 }, { unique: true });
ReferralSchema.index({ wallet: 1 });

export const Referral =
  mongoose.models.Referral ||
  mongoose.model<IReferral>("Referral", ReferralSchema);
