import type { FastifyReply, FastifyRequest } from 'fastify';
import { noAutorizado, prohibido } from '../lib/errors.js';
import { verificarAccessToken } from './tokens.js';
import { rolAlcanza, type RolPlataforma, type RolTenant } from './tipos.js';

declare module 'fastify' {
  interface FastifyRequest {
    usuario?: {
      id: string;
      sesionId: string;
      tenantId: string | null;
      rol: RolTenant | null;
      plataforma: RolPlataforma | null;
    };
  }
}

/** Exige un access token válido. No comprueba permisos, solo identidad. */
export async function autenticar(peticion: FastifyRequest, _respuesta: FastifyReply) {
  const cabecera = peticion.headers.authorization;

  if (!cabecera?.startsWith('Bearer ')) {
    throw noAutorizado('falta la cabecera Authorization: Bearer');
  }

  try {
    const contenido = await verificarAccessToken(cabecera.slice(7));
    peticion.usuario = {
      id: contenido.sub,
      sesionId: contenido.sid,
      tenantId: contenido.tid,
      rol: contenido.rol,
      plataforma: contenido.plataforma,
    };
  } catch (error) {
    throw noAutorizado(`access token inválido: ${(error as Error).message}`);
  }
}

/**
 * Exige que la sesión tenga un tenant activo. Se usa en todo lo que toca datos
 * de un cliente: sin tenant no hay con qué fijar app.tenant_id, y sin eso RLS
 * no devolvería nada de todos modos.
 */
export function exigirTenant(peticion: FastifyRequest): string {
  const tenantId = peticion.usuario?.tenantId;
  if (!tenantId) {
    throw prohibido('la sesión no tiene un cliente activo; usá POST /auth/tenant');
  }
  return tenantId;
}

/**
 * Exige un rol mínimo dentro del tenant. Compara por nivel y no contra una lista
 * de roles, para que añadir un rol intermedio no obligue a revisar cada endpoint.
 */
export function exigirRol(minimo: RolTenant) {
  return async (peticion: FastifyRequest) => {
    if (!peticion.usuario) throw noAutorizado('sin autenticar');
    exigirTenant(peticion);

    if (!rolAlcanza(peticion.usuario.rol, minimo)) {
      throw prohibido(`requiere rol ${minimo}, tiene ${peticion.usuario.rol ?? 'ninguno'}`);
    }
  };
}

/** Exige ser staff de GPI. */
export function exigirPlataforma(...roles: RolPlataforma[]) {
  return async (peticion: FastifyRequest) => {
    if (!peticion.usuario) throw noAutorizado('sin autenticar');
    const rol = peticion.usuario.plataforma;
    if (!rol || (roles.length > 0 && !roles.includes(rol))) {
      throw prohibido(`requiere rol de plataforma ${roles.join('|') || 'cualquiera'}`);
    }
  };
}
