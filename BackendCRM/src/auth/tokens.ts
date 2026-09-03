import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config.js';
import type { RolPlataforma, RolTenant } from './tipos.js';

const clave = new TextEncoder().encode(config.JWT_SECRET);

export interface ContenidoAccessToken {
  sub: string;                       // id del usuario
  sid: string;                       // id de la sesión, para poder revocarla
  tid: string | null;                // tenant activo
  rol: RolTenant | null;             // rol dentro de ese tenant
  plataforma: RolPlataforma | null;  // rol global, si lo tiene
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

  return {
    sub: payload.sub as string,
    sid: payload.sid as string,
    tid: (payload.tid as string | null) ?? null,
    rol: (payload.rol as RolTenant | null) ?? null,
    plataforma: (payload.plataforma as RolPlataforma | null) ?? null,
  };
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
