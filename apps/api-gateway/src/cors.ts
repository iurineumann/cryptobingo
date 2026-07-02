import { CorsOptions } from "cors";

const DEFAULT_ALLOWED_ORIGINS: string[] = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://test.cryptobingo.bet",
  "https://test-api.cryptobingo.bet",
  "https://test-swap.cryptobingo.bet",
];

function normalizeOrigin(origin: string): string | null {
  const trimmed = origin.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed;
  }
}

export function getAllowedOrigins(envValue?: string): string[] {
  const configuredOrigins = (envValue ?? process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const merged = new Set<string>();

  for (const origin of [...DEFAULT_ALLOWED_ORIGINS, ...configuredOrigins]) {
    const normalized = normalizeOrigin(origin);
    if (normalized) {
      merged.add(normalized);
    }
  }

  return Array.from(merged);
}

export function createCorsOptions(allowedOrigins: string[]): CorsOptions {
  return {
    origin: (origin, callback) => {
      // Permite requests sem origin (ex: curl, Postman, mobile apps)
      if (!origin) return callback(null, true);

      const normalizedOrigin = normalizeOrigin(origin);
      if (normalizedOrigin && allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      callback(new Error(`CORS: origin não autorizada: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: [
      "RateLimit-Limit",
      "RateLimit-Remaining",
      "RateLimit-Reset",
    ],
    credentials: true,
    maxAge: 86400,
  };
}
