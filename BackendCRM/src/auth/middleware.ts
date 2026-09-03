import type { FastifyReply, FastifyRequest } from 'fastify';
import { noAutorizado, prohibido } from '../lib/errors.js';
import { verificarAccessToken } from './tokens.js';
import { rolAlcanza, type RolTenant } from './tipos.js';

declare module 'fastify' {
  interface FastifyRequest {
    // tenantId y rol no son nulables: cada usuario pertenece exactamente a un
    // cliente, así que toda sesión autenticada tiene cliente y rol. Un token sin
    // ellos ni siquiera pasa la verificación (ver tokens.ts).
    usuario?: {
      id: string;
      sesionId: string;
      tenantId: string;
      rol: RolTenant;
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
    };
  } catch (error) {
    throw noAutorizado(`access token inválido: ${(error as Error).message}`);
  }
}

/**
 * Exige un rol mínimo dentro del tenant. Compara por nivel y no contra una lista
 * de roles, para que añadir un rol intermedio no obligue a revisar cada endpoint.
 *
 * No hay ninguna comprobación por encima del tenant: no existe rol que permita
 * saltar de un cliente a otro, así que un endpoint solo puede exigir más rol
 * DENTRO del cliente de la sesión.
 */
export function exigirRol(minimo: RolTenant) {
  return async (peticion: FastifyRequest) => {
    if (!peticion.usuario) throw noAutorizado('sin autenticar');

    if (!rolAlcanza(peticion.usuario.rol, minimo)) {
      throw prohibido(`requiere rol ${minimo}, tiene ${peticion.usuario.rol}`);
    }
  };
}
