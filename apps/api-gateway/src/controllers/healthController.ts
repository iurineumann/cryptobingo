// apps/api-gateway/src/controllers/healthController.ts
// Probes Kubernetes: liveness e readiness.
//
// GET /health/live  → 200 se o processo está vivo (sem checks externos)
// GET /health/ready → 200 se todas as dependências estão operacionais
//
// Usados pelo kubelet para:
//   livenessProbe:  reinicia o pod se o processo travar
//   readinessProbe: remove o pod do load balancer durante inicialização ou falha de deps

import { Request, Response } from 'express';
import mongoose               from 'mongoose';
import { pgPool }             from '../database';
import { redisClient }        from '../database/redis';

const START_TIME = Date.now();

// ── Liveness ─────────────────────────────────────────────────────────────────
// Sempre retorna 200 enquanto o evento loop Node.js estiver respondendo.
// Kubernetes reinicia o container se isso parar de responder.

export function livenessCheck(_req: Request, res: Response): void {
    res.status(200).json({
        status:   'alive',
        uptime_s: Math.floor((Date.now() - START_TIME) / 1000),
    });
}

// ── Readiness ─────────────────────────────────────────────────────────────────
// Verifica MongoDB, PostgreSQL e Redis.
// Retorna 200 apenas se todas as deps estiverem operacionais.
// Kubernetes remove o pod do LB se isso retornar 4xx/5xx.

export async function readinessCheck(_req: Request, res: Response): Promise<void> {
    const checks: Record<string, 'ok' | 'fail'> = {};
    let allOk = true;

    // MongoDB — mongoose.connection.readyState: 1 = connected
    try {
        if (mongoose.connection.readyState === 1) {
            checks.mongo = 'ok';
        } else {
            checks.mongo = 'fail';
            allOk = false;
        }
    } catch {
        checks.mongo = 'fail';
        allOk = false;
    }

    // PostgreSQL — ping com query simples
    try {
        const client = await pgPool.connect();
        await client.query('SELECT 1');
        client.release();
        checks.postgres = 'ok';
    } catch {
        checks.postgres = 'fail';
        allOk = false;
    }

    // Redis — isOpen é verdadeiro enquanto conectado
    try {
        if (redisClient.isOpen) {
            checks.redis = 'ok';
        } else {
            checks.redis = 'fail';
            allOk = false;
        }
    } catch {
        checks.redis = 'fail';
        allOk = false;
    }

    res.status(allOk ? 200 : 503).json({
        status: allOk ? 'ready' : 'degraded',
        checks,
    });
}
