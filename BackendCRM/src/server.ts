import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { config } from './config.js';
import { ErrorApi } from './lib/errors.js';
import { rutasAuth } from './routes/auth.js';
import { pool } from './db/pool.js';

export async function crearServidor(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      // Sin esto, Fastify registra cada petición con sus cabeceras completas, y
      // ahí viaja el Bearer. Un token en el log es un token comprometido.
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie'],
        remove: true,
      },
    },
    // Detrás del ALB, req.ip debe ser la IP real del cliente y no la del
    // balanceador — si no, el rate limit por IP agrupa a todo el mundo en una.
    trustProxy: true,
  });

  await app.register(helmet, {
    // Es una API JSON, no sirve HTML: la CSP por defecto de helmet no aporta
    // nada y complica los mensajes de error.
    contentSecurityPolicy: false,
  });

  await app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    // Con el flag apagado, el limite queda tan alto que no dispara nunca. Se
    // registra igual para que la ruta siga leyendo su config y el codigo que se
    // prueba sea el mismo que corre en produccion.
    global: config.RATE_LIMIT_ENABLED,
  });

  // ── manejo de errores ──────────────────────────────────────────────────────
  app.setErrorHandler((error, peticion, respuesta) => {
    if (error instanceof ZodError) {
      return respuesta.code(400).send({
        error: 'peticion_invalida',
        mensaje: 'Los datos enviados no son válidos',
        campos: error.issues.map((i) => ({ campo: i.path.join('.'), problema: i.message })),
      });
    }

    if (error instanceof ErrorApi) {
      // El detalle interno va al log; al cliente solo el mensaje público. Un 401
      // no debe decir si falló el email o la contraseña.
      if (error.detalleInterno) {
        peticion.log.warn({ codigo: error.codigo, detalle: error.detalleInterno }, 'error de API');
      }
      return respuesta.code(error.estado).send({ error: error.codigo, mensaje: error.message });
    }

    if ((error as { statusCode?: number }).statusCode === 429) {
      return respuesta.code(429).send({
        error: 'demasiados_intentos',
        mensaje: 'Demasiadas peticiones. Probá de nuevo en un rato.',
      });
    }

    peticion.log.error({ err: error }, 'error no controlado');
    return respuesta.code(500).send({ error: 'error_interno', mensaje: 'Error interno' });
  });

  // ── salud ──────────────────────────────────────────────────────────────────
  // Liveness: responde si el proceso está vivo. NO toca la base — si lo hiciera,
  // una caída de la RDS haría que ECS matara y recreara tasks sanas en bucle.
  app.get('/healthz', async () => ({ estado: 'ok' }));

  // Readiness: sí comprueba la base, para saber si puede atender de verdad.
  app.get('/readyz', async (_peticion, respuesta) => {
    try {
      await pool.query('SELECT 1');
      return { estado: 'listo' };
    } catch {
      return respuesta.code(503).send({ estado: 'sin base de datos' });
    }
  });

  await app.register(rutasAuth, { prefix: '/api' });

  return app;
}
