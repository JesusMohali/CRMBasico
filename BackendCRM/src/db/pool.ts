import pg from 'pg';
import { config } from '../config.js';

// Los bigint de Postgres llegan como string por defecto (no caben en un number
// de JS). Los ids de leads son bigint y los devolvemos como string a propósito:
// convertirlos a number perdería precisión por encima de 2^53.
// El OID 20 es int8.
pg.types.setTypeParser(20, (valor) => valor);

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // RDS obliga TLS (rds.force_ssl = 1). El certificado lo firma la CA de AWS,
  // que no está en el store por defecto de Node; sin traer ese bundle, verificar
  // la cadena falla. Se cifra igual, pero no se autentica al servidor.
  // TODO: montar el bundle de RDS y pasar a rejectUnauthorized: true.
  ssl: config.usarTlsEnBase ? { rejectUnauthorized: false } : false,
});

export type Ejecutor = Pick<pg.PoolClient, 'query'>;

/**
 * Corre una función dentro de una transacción SIN contexto de tenant.
 *
 * Solo para el camino de autenticación (buscar un usuario por email, validar un
 * refresh token), que por definición ocurre antes de saber a qué cliente
 * pertenece quien está entrando. Las tablas que toca no llevan RLS.
 */
export async function enTransaccion<T>(fn: (cliente: Ejecutor) => Promise<T>): Promise<T> {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

/**
 * Corre una función dentro de una transacción CON el tenant fijado. Es la única
 * forma correcta de tocar datos de negocio.
 *
 * set_config y no "SET LOCAL app.tenant_id = ...": SET solo admite literales, así
 * que obligaría a concatenar el uuid dentro de la cadena SQL. Aquí va como
 * parámetro y no se concatena nada.
 *
 * El tercer argumento (true) equivale a LOCAL: el valor muere con la
 * transacción. Es imprescindible con pool de conexiones — un valor no-local se
 * queda pegado a la conexión y la siguiente petición, que puede ser de OTRO
 * cliente, lo heredaría.
 */
export async function conTenant<T>(
  tenantId: string,
  fn: (cliente: Ejecutor) => Promise<T>,
): Promise<T> {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

export async function cerrarPool(): Promise<void> {
  await pool.end();
}
