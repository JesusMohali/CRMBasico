import { z } from 'zod';

// La configuración se valida al arrancar y no después. Un backend que arranca
// sin JWT_SECRET y falla en el primer login es mucho peor que uno que no
// arranca: el primero parece sano hasta que alguien intenta entrar.
const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string().url(),

  // TLS contra la base, explicito y no deducido de NODE_ENV. La RDS lo exige
  // (rds.force_ssl = 1) pero un Postgres local no lo tiene, y atarlo a NODE_ENV
  // hacia que la misma imagen fallara con un 503 opaco segun donde corriera.
  // Sin valor, se activa en produccion y no en el resto.
  DATABASE_SSL: z.enum(['true', 'false']).optional().transform((v) => v === undefined ? undefined : v === 'true'),

  // 32 bytes como mínimo: con HS256, la fuerza de la firma es la de la clave.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_ISSUER: z.string().default('gpi-crm'),
  JWT_AUDIENCE: z.string().default('gpi-crm-api'),

  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),        // 15 min
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(2592000),   // 30 días
  INVITATION_TTL_SECONDS: z.coerce.number().int().positive().default(604800),       // 7 días
  PASSWORD_RESET_TTL_SECONDS: z.coerce.number().int().positive().default(3600),     // 1 hora

  // Tras este número de fallos la cuenta queda bloqueada el tiempo indicado.
  MAX_FAILED_LOGINS: z.coerce.number().int().positive().default(5),
  LOCKOUT_SECONDS: z.coerce.number().int().positive().default(900),

  // Se puede apagar en los tests, que hacen decenas de logins desde la misma IP.
  // En produccion NO se apaga: es la primera barrera contra fuerza bruta, antes
  // incluso de que el bloqueo por cuenta entre en juego.
  // NO se usa z.coerce.boolean(): Boolean("false") es true, asi que apagarlo por
  // variable de entorno seria imposible y el fallo silencioso.
  RATE_LIMIT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((valor) => valor === 'true'),

  CORS_ORIGINS: z.string().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const resultado = esquema.safeParse(process.env);

if (!resultado.success) {
  const detalle = resultado.error.issues
    .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Configuración inválida:\n${detalle}`);
}

export const config = {
  ...resultado.data,
  usarTlsEnBase: resultado.data.DATABASE_SSL ?? resultado.data.NODE_ENV === 'production',
  corsOrigins: resultado.data.CORS_ORIGINS.split(',')
    .map((origen) => origen.trim())
    .filter(Boolean),
  esProduccion: resultado.data.NODE_ENV === 'production',
};

export type Config = typeof config;
