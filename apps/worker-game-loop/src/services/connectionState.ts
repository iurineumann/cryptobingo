// Estado compartilhado de conectividade para health checks.
// Evita circular dependency entre metrics.ts ↔ rabbitmq.ts/redis.ts.

export let redisConnected  = false;
export let rabbitConnected = false;

export function setRedisConnected(v: boolean): void {
    redisConnected = v;
}

export function setRabbitConnected(v: boolean): void {
    rabbitConnected = v;
}
