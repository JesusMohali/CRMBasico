import { hash, verify, Algorithm } from '@node-rs/argon2';

// Parámetros de Argon2id recomendados por OWASP: 19 MiB de memoria, 2
// iteraciones, paralelismo 1. El coste real está en la memoria, que es lo que
// encarece el ataque con GPU.
const OPCIONES = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashearPassword(password: string): Promise<string> {
  return hash(password, OPCIONES);
}

/**
 * Verifica una contraseña contra su hash.
 *
 * Devuelve false ante cualquier error en vez de propagarlo: un hash corrupto o
 * con un formato que la librería no entiende debe ser un login fallido, no un
 * 500 que le dice al atacante que esa cuenta tiene algo raro.
 */
export async function verificarPassword(hashGuardado: string, password: string): Promise<boolean> {
  try {
    return await verify(hashGuardado, password, OPCIONES);
  } catch {
    return false;
  }
}

/**
 * Hash de descarte con el mismo coste que uno real.
 *
 * Se usa cuando el email no existe. Sin esto, un login contra un email
 * inexistente responde en microsegundos y uno contra un email real tarda ~50 ms,
 * y esa diferencia permite enumerar qué cuentas existen sin necesitar la
 * contraseña. Gastar el mismo tiempo iguala las dos respuestas.
 */
const HASH_SENUELO =
  '$argon2id$v=19$m=19456,t=2,p=1$c2VuYWxkZXNjYXJ0ZQ$K7gNU3sdo+OL0wNhqoVWhr3g6s1xYv72ol/pe/Unols';

export async function gastarTiempoDeVerificacion(): Promise<void> {
  await verificarPassword(HASH_SENUELO, 'no importa lo que haya aqui');
}
