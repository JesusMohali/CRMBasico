import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config.js';
import type { RolTenant } from './tipos.js';

const clave = new TextEncoder().encode(config.JWT_SECRET);

/**
 * Un usuario pertenece a un único cliente, así que la sesión SIEMPRE está
 * scopeada a ese cliente: `tid` y `rol` no son opcionales. Antes lo eran porque
 * existía la sesión "sin cliente activo" de quien pertenecía a varios, y la
 * sesión global de un admin de plataforma. Ninguna de las dos existe ya.
 */
export interface ContenidoAccessToken {
  sub: string;            // id del usuario
  sid: string;            // id de la sesión, para poder revocarla
  tid: string;            // tenant de la sesión
  rol: RolTenant;         // rol dentro de ese tenant
}

export async function firmarAccessToken(contenido: ContenidoAccessToken): Promise<string> {
  return new SignJWT({ ...contenido })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(config.JWT_ISSUER)
    .setAudience(config.JWT_AUDIENCE)
    .setExpirationTime(`${config.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(clave);
}

export async function verificarAccessToken(token: string): Promise<ContenidoAccessToken> {
  const { payload } = await jwtVerify(token, clave, {
    issuer: config.JWT_ISSUER,
    audience: config.JWT_AUDIENCE,
    algorithms: ['HS256'], // fijado: sin esto, un token con alg:none sería aceptado
  });

  const tid = payload.tid as string | undefined;
  const rol = payload.rol as RolTenant | undefined;

  // Un token firmado por nosotros pero sin tenant es de la etapa anterior (la que
  // permitía sesiones sin cliente activo). Se rechaza aquí, en un solo sitio, en
  // vez de dejar que llegue a los endpoints con tenantId nulo y que cada uno
  // decida qué hacer: con el modelo nuevo esa sesión no representa nada.
  if (!tid || !rol) {
    throw new Error('el token no lleva tenant; es de un modelo anterior');
  }

  return { sub: payload.sub as string, sid: payload.sid as string, tid, rol };
}

/**
 * Los refresh token son opacos y aleatorios, no JWT: tienen que poder revocarse,
 * y un JWT válido lo es hasta que caduca aunque lo hayas borrado de la base.
 */
export function generarRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * En la base se guarda el SHA-256, nunca el token.
 *
 * No lleva salt a propósito: el token ya son 32 bytes aleatorios, así que no hay
 * diccionario que precomputar. Y sin salt el hash es determinista, que es lo que
 * permite buscar la sesión por índice en vez de recorrer la tabla entera
 * comparando de una en una.
 */
export function hashearToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

/** Comparación en tiempo constante, para no filtrar cuántos bytes coincidían. */
export function tokensIguales(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}
