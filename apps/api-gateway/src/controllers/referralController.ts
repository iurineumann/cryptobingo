import { randomBytes } from "node:crypto";
import { Request, Response } from "express";
import { Referral } from "../models/Referral";
import { logger } from '../middleware/logger';
import { getRequestId } from '../middleware/requestId';

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

const TIERS = [
  { min: 5, badge: "bronze_referrer" },
  { min: 10, badge: "silver_referrer" },
  { min: 25, badge: "gold_referrer" },
  { min: 50, badge: "platinum_referrer" },
  { min: 100, badge: "diamond_referrer" },
];

function generateCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return code;
}

function getTier(total: number): string | null {
  let result: string | null = null;
  for (const t of TIERS) {
    if (total >= t.min) result = t.badge;
  }
  return result;
}

function getNextTier(total: number): { min: number; badge: string; remaining: number } | null {
  for (const t of TIERS) {
    if (total < t.min) return { ...t, remaining: t.min - total };
  }
  return null;
}

function getWallet(req: Request): string | null {
  return (req as any).user?.wallet || null;
}

async function findOrCreate(wallet: string) {
  let doc = await Referral.findOne({ wallet });
  if (!doc) {
    let code: string;
    let attempts = 0;
    do {
      code = generateCode();
      attempts++;
    } while (await Referral.findOne({ referralCode: code }) && attempts < 20);
    doc = await Referral.create({ wallet, referralCode: code, referred: [], rewards: { xpAwarded: 0, ticketsAwarded: 0 } });
  }
  return doc;
}

export async function getReferralStatus(req: Request, res: Response) {
  const wallet = getWallet(req);
  if (!wallet) return res.status(401).json({ error: "Autenticação necessária." });

  try {
    const doc = await findOrCreate(wallet);
    const totalReferred = doc.referred.length;
    return res.status(200).json({
      code: doc.referralCode,
      totalReferred,
      xpEarned: doc.rewards.xpAwarded,
      ticketsEarned: doc.rewards.ticketsAwarded,
      referred: doc.referred,
      tier: getTier(totalReferred),
      nextTier: getNextTier(totalReferred),
    });
  } catch (err) {
    logger.error({ err, tag: 'Referral' }, "Erro ao buscar status");
    return res.status(500).json({ error: "Erro interno." });
  }
}

export async function generateReferralCode(req: Request, res: Response) {
  const wallet = getWallet(req);
  if (!wallet) return res.status(401).json({ error: "Autenticação necessária." });

  try {
    let doc = await Referral.findOne({ wallet });
    if (doc) return res.status(200).json({ code: doc.referralCode });

    let code: string;
    let attempts = 0;
    do {
      code = generateCode();
      attempts++;
    } while (await Referral.findOne({ referralCode: code }) && attempts < 20);

    doc = await Referral.create({ wallet, referralCode: code, referred: [], rewards: { xpAwarded: 0, ticketsAwarded: 0 } });
    return res.status(201).json({ code: doc.referralCode });
  } catch (err) {
    logger.error({ err, tag: 'Referral' }, "Erro ao gerar código");
    return res.status(500).json({ error: "Erro interno." });
  }
}

export async function applyReferralCode(req: Request, res: Response) {
  const wallet = getWallet(req);
  if (!wallet) return res.status(401).json({ error: "Autenticação necessária." });

  const { code } = req.body;
  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "Código de referral inválido." });
  }

  try {
    const referrer = await Referral.findOne({ referralCode: code.toUpperCase() });
    if (!referrer) return res.status(404).json({ error: "Código de referral não encontrado." });
    if (referrer.wallet === wallet) return res.status(400).json({ error: "Não pode usar seu próprio código." });
    if (referrer.referred.includes(wallet)) {
      return res.status(409).json({ error: "Código já utilizado por esta conta." });
    }

    referrer.referred.push(wallet);
    await referrer.save();

    return res.status(200).json({ message: "Código aplicado com sucesso!", referrer: referrer.wallet });
  } catch (err) {
    logger.error({ err, tag: 'Referral' }, "Erro ao aplicar código");
    return res.status(500).json({ error: "Erro interno." });
  }
}
