import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const aqui = dirname(fileURLToPath(import.meta.url));

export const URL_ADMIN = process.env.TEST_ADMIN_URL ?? 'postgresql://postgres:postgres@localhost:55432/postgres';
export const URL_APP   = process.env.TEST_APP_URL   ?? 'postgresql://crm_test_app:apppass@localhost:55432/crm_test';

/**
 * Deja la base de test en un estado conocido: esquema aplicado, roles creados y
 * usuarios de prueba con contraseñas REALES (la semilla de dev trae hashes de
 * relleno que no validan contra nada, a propósito).
 */
export async function prepararBase(hashDePrueba: string) {
  const admin = new pg.Client({ connectionString: URL_ADMIN });
  await admin.connect();

  await admin.query(`DROP DATABASE IF EXISTS crm_test WITH (FORCE)`);
  await admin.query(`DROP ROLE IF EXISTS crm_test_app`);
  await admin.query(`DROP ROLE IF EXISTS crm_test_bot`);
  await admin.query(`DROP ROLE IF EXISTS crm_test`);
  await admin.query(`CREATE ROLE crm_test LOGIN PASSWORD 'ownerpass'`);
  await admin.query(`CREATE ROLE crm_test_app LOGIN PASSWORD 'apppass'`);
  await admin.query(`CREATE ROLE crm_test_bot LOGIN PASSWORD 'botpass'`);
  await admin.query(`CREATE DATABASE crm_test OWNER crm_test`);
  await admin.end();

  // Las tablas las crea el DUEÑO, no el superusuario: si las creara postgres,
  // el rol de la aplicación tampoco sería dueño pero la prueba no reflejaría el
  // reparto real de infra.
  const dueno = new pg.Client({
    connectionString: 'postgresql://crm_test:ownerpass@localhost:55432/crm_test',
  });
  await dueno.connect();
  await dueno.query(`GRANT CONNECT ON DATABASE crm_test TO crm_test_app, crm_test_bot`);
  await dueno.query(readFileSync(join(aqui, 'schema.sql'), 'utf8'));
  await dueno.query(readFileSync(join(aqui, 'seed.sql'), 'utf8'));

  // Contraseñas reales solo para los tests.
  await dueno.query(
    `UPDATE auth.users SET password_hash = $1
      WHERE email IN ('ana@acme-formacion.test','bruno@acme-formacion.test','carla@planb-trading.test')`,
    [hashDePrueba],
  );
  await dueno.end();
}

export async function idDeTenant(slug: string): Promise<string> {
  const cliente = new pg.Client({ connectionString: URL_ADMIN.replace('/postgres', '/crm_test') });
  await cliente.connect();
  const { rows } = await cliente.query('SELECT id FROM auth.tenants WHERE slug = $1', [slug]);
  await cliente.end();
  return rows[0].id;
}
