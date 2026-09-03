import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const aqui = dirname(fileURLToPath(import.meta.url));

export const URL_ADMIN = process.env.TEST_ADMIN_URL ?? 'postgresql://postgres:postgres@localhost:55432/postgres';
export const URL_APP   = process.env.TEST_APP_URL   ?? 'postgresql://crm_test_app:apppass@localhost:55432/crm_test';

/**
 * Cuentas que existen SOLO en los tests.
 *
 * La semilla de infra siembra exactamente un admin por cliente, que es lo que
 * creará el backoffice externo al dar de alta un cliente. Los demás roles y los
 * casos raros (una cuenta sin cliente, una que se va a bloquear) hacen falta
 * para ejercitar la API, pero no pintan nada en una semilla de dev: se crean
 * aquí, donde se ve de un vistazo para qué sirve cada una.
 *
 * Todas van a Acme salvo indicación contraria: el admin de Plan B tiene que
 * quedarse solo en su cliente para que las pruebas de aislamiento signifiquen
 * algo.
 */
export const CUENTAS = {
  adminAcme:  'admin@acme-formacion.test',   // de la semilla de infra
  adminPlanb: 'admin@planb-trading.test',    // de la semilla de infra
  member:     'member@acme-formacion.test',
  viewer:     'viewer@acme-formacion.test',
  // Se bloquea a propósito a fuerza de fallos; por eso no la usa nadie más.
  bloqueo:    'bloqueo@acme-formacion.test',
  // A esta le cambian el rol en marcha para comprobar que el refresh lo relee.
  rolCambiante: 'rol-cambiante@acme-formacion.test',
  // A esta la quitan del cliente.
  saliente:   'saliente@acme-formacion.test',
  // A esta le cambian la contraseña, lo que le cierra todas las sesiones.
  password:   'password@acme-formacion.test',
  // Cuenta válida que no pertenece a ningún cliente: no puede entrar.
  sinCliente: 'sin-cliente@ninguna-parte.test',
} as const;

const FIXTURES: Array<{ email: string; nombre: string; slug: string | null; rol: string }> = [
  { email: CUENTAS.member,       nombre: 'Miembro de Acme',    slug: 'acme-formacion', rol: 'member' },
  { email: CUENTAS.viewer,       nombre: 'Viewer de Acme',     slug: 'acme-formacion', rol: 'viewer' },
  { email: CUENTAS.bloqueo,      nombre: 'Cuenta de bloqueo',  slug: 'acme-formacion', rol: 'member' },
  { email: CUENTAS.rolCambiante, nombre: 'Rol cambiante',      slug: 'acme-formacion', rol: 'member' },
  { email: CUENTAS.saliente,     nombre: 'Miembro saliente',   slug: 'acme-formacion', rol: 'member' },
  { email: CUENTAS.password,     nombre: 'Cambia contraseña',  slug: 'acme-formacion', rol: 'member' },
  { email: CUENTAS.sinCliente,   nombre: 'Sin cliente',        slug: null,             rol: 'member' },
];

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
    `UPDATE auth.users SET password_hash = $1 WHERE email IN ($2, $3)`,
    [hashDePrueba, CUENTAS.adminAcme, CUENTAS.adminPlanb],
  );

  // Las cuentas de prueba, con su membresía. Van de una en una y no en un solo
  // INSERT porque el hash es un parámetro: una consulta parametrizada no puede
  // llevar varias sentencias.
  for (const fixture of FIXTURES) {
    const { rows } = await dueno.query<{ id: string }>(
      `INSERT INTO auth.users (email, full_name, status, password_hash, email_verified_at)
       VALUES ($1, $2, 'active', $3, now()) RETURNING id`,
      [fixture.email, fixture.nombre, hashDePrueba],
    );

    if (fixture.slug === null) continue;

    await dueno.query(
      `INSERT INTO auth.tenant_memberships (tenant_id, user_id, role, status)
       SELECT id, $2, $3::auth.tenant_role, 'active' FROM auth.tenants WHERE slug = $1`,
      [fixture.slug, rows[0]!.id, fixture.rol],
    );
  }

  await dueno.end();
}
