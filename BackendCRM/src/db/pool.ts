import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { config } from '../config.js';

// Los bigint de Postgres llegan como string por defecto (no caben en un number
// de JS). Los ids de leads son bigint y los devolvemos como string a propósito:
// convertirlos a number perdería precisión por encima de 2^53.
// El OID 20 es int8.
pg.types.setTypeParser(20, (valor) => valor);

/**
 * Lee el bundle de CA de AWS RDS que se usa para verificar el certificado del
 * servidor.
 *
 * Si falta, se cae al arrancar en vez de seguir con rejectUnauthorized: false.
 * Es deliberado: una conexión cifrada pero sin verificar el certificado protege
 * de quien escucha el cable, no de quien se pone en medio, y ese "va cifrado"
 * pasa desapercibido durante meses. Mejor un arranque que falla con un mensaje
 * claro que una base a la que se habla sin saber quién contesta.
 */
function caDeRds(): string {
  const ruta = resolve(config.RDS_CA_BUNDLE_PATH);
  try {
    return readFileSync(ruta, 'utf8');
  } catch (error) {
    throw new Error(
      `No se pudo leer el bundle de CA de RDS en ${ruta}. Con TLS activo ` +
        `(DATABASE_SSL) hace falta para verificar el certificado del servidor. ` +
        `Ajustá RDS_CA_BUNDLE_PATH o descargá el bundle de ` +
        `https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem`,
      { cause: error },
    );
  }
}

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // RDS obliga TLS (rds.force_ssl = 1) y su certificado lo firma una CA de AWS
  // que no está en el store por defecto de Node. Con el bundle global montado en
  // la imagen (ver Dockerfile) la cadena sí valida, así que rejectUnauthorized va
  // en true: la conexión además de cifrada autentica al servidor.
  //
  // El fichero se lee una sola vez, al construir el pool, y no en cada conexión.
  ssl: config.usarTlsEnBase ? { ca: caDeRds(), rejectUnauthorized: true } : false,
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
