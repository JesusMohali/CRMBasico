import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prepararBase, URL_APP } from './helpers.js';

const PASSWORD = 'contrasena-de-prueba-larga';

let app: FastifyInstance;

async function pedir(metodo: string, ruta: string, cuerpo?: unknown, token?: string) {
  const respuesta = await app.inject({
    method: metodo as 'POST',
    url: ruta,
    payload: cuerpo as object,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { estado: respuesta.statusCode, cuerpo: respuesta.json() as any };
}

const login = (email: string, password = PASSWORD, tenant?: string) =>
  pedir('POST', '/api/auth/login', { email, password, ...(tenant ? { tenant } : {}) });

beforeAll(async () => {
  process.env.DATABASE_URL = URL_APP;
  process.env.JWT_SECRET = 'clave-de-prueba-con-mas-de-treinta-y-dos-caracteres';
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = process.env.VERBOSE ? 'error' : 'fatal';
  // Sin esto la suite se estrangula sola: hace decenas de logins desde la misma
  // IP. Lo que aqui se prueba es el bloqueo POR CUENTA, que es independiente.
  process.env.RATE_LIMIT_ENABLED = 'false';

  const { hashearPassword } = await import('../src/auth/passwords.js');
  await prepararBase(await hashearPassword(PASSWORD));

  const { crearServidor } = await import('../src/server.js');
  app = await crearServidor();
}, 120_000);

afterAll(async () => {
  await app?.close();
  const { cerrarPool } = await import('../src/db/pool.js');
  await cerrarPool();
});

describe('login', () => {
  it('entra y devuelve el tenant cuando solo pertenece a uno', async () => {
    const r = await login('bruno@acme-formacion.test');
    expect(r.estado).toBe(200);
    expect(r.cuerpo.tenant.slug).toBe('acme-formacion');
    expect(r.cuerpo.tenant.rol).toBe('member');
    expect(r.cuerpo.accessToken).toBeTruthy();
    expect(r.cuerpo.requiereElegirTenant).toBe(false);
  });

  it('NO elige tenant cuando pertenece a varios', async () => {
    // Ana es owner en Acme y admin en Plan B.
    const r = await login('ana@acme-formacion.test');
    expect(r.estado).toBe(200);
    expect(r.cuerpo.tenant).toBeNull();
    expect(r.cuerpo.requiereElegirTenant).toBe(true);
    expect(r.cuerpo.membresias).toHaveLength(2);
  });

  it('acepta el tenant pedido explícitamente', async () => {
    const r = await login('ana@acme-formacion.test', PASSWORD, 'planb-trading');
    expect(r.cuerpo.tenant.slug).toBe('planb-trading');
    expect(r.cuerpo.tenant.rol).toBe('admin');
  });

  it('rechaza un tenant al que no pertenece', async () => {
    const r = await login('bruno@acme-formacion.test', PASSWORD, 'planb-trading');
    expect(r.estado).toBe(403);
  });

  it('rechaza la contraseña incorrecta', async () => {
    const r = await login('bruno@acme-formacion.test', 'la-que-no-es');
    expect(r.estado).toBe(401);
  });

  it('responde igual ante un email inexistente que ante password mala', async () => {
    const inexistente = await login('nadie@ninguna-parte.test');
    const malaPassword = await login('bruno@acme-formacion.test', 'la-que-no-es');
    // Mismo código y mismo mensaje: no se puede deducir si el email existe.
    expect(inexistente.estado).toBe(malaPassword.estado);
    expect(inexistente.cuerpo.mensaje).toBe(malaPassword.cuerpo.mensaje);
  });

  it('bloquea la cuenta tras varios fallos', async () => {
    for (let i = 0; i < 5; i++) await login('carla@planb-trading.test', 'mal');
    const r = await login('carla@planb-trading.test');
    expect(r.estado).toBe(429);
    // Que venga del bloqueo de la cuenta y no del rate limit por IP, que
    // devuelve el mismo codigo con otro mensaje.
    expect(r.cuerpo.mensaje).toMatch(/Cuenta bloqueada/);
  });
});

describe('refresh', () => {
  it('rota el token: el viejo deja de valer', async () => {
    const entrada = await login('bruno@acme-formacion.test');
    const viejo = entrada.cuerpo.refreshToken;

    const rotado = await pedir('POST', '/api/auth/refresh', { refreshToken: viejo });
    expect(rotado.estado).toBe(200);
    expect(rotado.cuerpo.refreshToken).not.toBe(viejo);

    const reintento = await pedir('POST', '/api/auth/refresh', { refreshToken: viejo });
    expect(reintento.estado).toBe(401);
  });

  it('reutilizar un token revocado mata TODAS las sesiones del usuario', async () => {
    const a = await login('bruno@acme-formacion.test');
    const b = await login('bruno@acme-formacion.test');

    // Se rota la sesión A, dejando su token viejo revocado.
    const rotado = await pedir('POST', '/api/auth/refresh', { refreshToken: a.cuerpo.refreshToken });
    expect(rotado.estado).toBe(200);

    // Alguien usa el token viejo: se interpreta como robo.
    await pedir('POST', '/api/auth/refresh', { refreshToken: a.cuerpo.refreshToken });

    // La sesión B, que no tenía nada que ver, también cae.
    const sesionB = await pedir('POST', '/api/auth/refresh', { refreshToken: b.cuerpo.refreshToken });
    expect(sesionB.estado).toBe(401);
  });
});

describe('permisos por rol', () => {
  it('un viewer no puede invitar', async () => {
    const ana = await login('ana@acme-formacion.test', PASSWORD, 'planb-trading');
    // Ana es admin en Plan B: sí puede.
    const comoAdmin = await pedir(
      'POST', '/api/members/invitations',
      { email: 'nuevo@planb-trading.test', rol: 'member' },
      ana.cuerpo.accessToken,
    );
    expect(comoAdmin.estado).toBe(200);

    // Bruno es member en Acme: no puede.
    const bruno = await login('bruno@acme-formacion.test');
    const comoMember = await pedir(
      'POST', '/api/members/invitations',
      { email: 'otro@acme-formacion.test', rol: 'member' },
      bruno.cuerpo.accessToken,
    );
    expect(comoMember.estado).toBe(403);
  });

  it('sin tenant activo no se puede tocar nada del cliente', async () => {
    const ana = await login('ana@acme-formacion.test'); // sin elegir tenant
    const r = await pedir('GET', '/api/members', undefined, ana.cuerpo.accessToken);
    expect(r.estado).toBe(403);
  });

  it('cada tenant ve solo sus miembros', async () => {
    const acme = await login('ana@acme-formacion.test', PASSWORD, 'acme-formacion');
    const planb = await login('ana@acme-formacion.test', PASSWORD, 'planb-trading');

    const enAcme = await pedir('GET', '/api/members', undefined, acme.cuerpo.accessToken);
    const enPlanb = await pedir('GET', '/api/members', undefined, planb.cuerpo.accessToken);

    const emailsAcme = enAcme.cuerpo.map((m: any) => m.email);
    const emailsPlanb = enPlanb.cuerpo.map((m: any) => m.email);

    expect(emailsAcme).toContain('bruno@acme-formacion.test');
    expect(emailsAcme).not.toContain('carla@planb-trading.test');
    expect(emailsPlanb).toContain('carla@planb-trading.test');
    expect(emailsPlanb).not.toContain('bruno@acme-formacion.test');
  });
});

describe('cambio de tenant', () => {
  it('emite un token nuevo con el otro cliente', async () => {
    const entrada = await login('ana@acme-formacion.test', PASSWORD, 'acme-formacion');
    const cambio = await pedir(
      'POST', '/api/auth/tenant', { tenant: 'planb-trading' }, entrada.cuerpo.accessToken,
    );
    expect(cambio.estado).toBe(200);
    expect(cambio.cuerpo.tenant.slug).toBe('planb-trading');
    expect(cambio.cuerpo.tenant.rol).toBe('admin');
  });

  it('no deja cambiar a un cliente ajeno', async () => {
    const bruno = await login('bruno@acme-formacion.test');
    const r = await pedir(
      'POST', '/api/auth/tenant', { tenant: 'planb-trading' }, bruno.cuerpo.accessToken,
    );
    expect(r.estado).toBe(403);
  });
});

describe('tokens', () => {
  it('rechaza un token inventado', async () => {
    const r = await pedir('GET', '/api/auth/me', undefined, 'esto.no.es');
    expect(r.estado).toBe(401);
  });

  it('rechaza alg:none', async () => {
    const contenido = Buffer.from(JSON.stringify({ sub: 'x', sid: 'y' })).toString('base64url');
    const cabecera = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const r = await pedir('GET', '/api/auth/me', undefined, `${cabecera}.${contenido}.`);
    expect(r.estado).toBe(401);
  });

  it('/auth/me devuelve las membresías', async () => {
    const ana = await login('ana@acme-formacion.test', PASSWORD, 'acme-formacion');
    const r = await pedir('GET', '/api/auth/me', undefined, ana.cuerpo.accessToken);
    expect(r.estado).toBe(200);
    expect(r.cuerpo.membresias).toHaveLength(2);
    expect(r.cuerpo.email).toBe('ana@acme-formacion.test');
  });
});

describe('contraseñas', () => {
  it('cambiarla cierra todas las sesiones', async () => {
    const entrada = await login('bruno@acme-formacion.test');
    const otra = await login('bruno@acme-formacion.test');

    const cambio = await pedir(
      'POST', '/api/auth/password/change',
      { actual: PASSWORD, nueva: 'otra-contrasena-bien-larga' },
      entrada.cuerpo.accessToken,
    );
    expect(cambio.estado).toBe(200);

    const refrescoViejo = await pedir('POST', '/api/auth/refresh', {
      refreshToken: otra.cuerpo.refreshToken,
    });
    expect(refrescoViejo.estado).toBe(401);
  });

  it('rechaza contraseñas cortas', async () => {
    const r = await pedir('POST', '/api/auth/password/reset', { token: 'x', password: 'corta' });
    expect(r.estado).toBe(400);
    expect(r.cuerpo.error).toBe('peticion_invalida');
  });

  it('forgot responde 202 exista o no el email', async () => {
    const existe = await pedir('POST', '/api/auth/password/forgot', {
      email: 'ana@acme-formacion.test',
    });
    const noExiste = await pedir('POST', '/api/auth/password/forgot', {
      email: 'fantasma@ninguna-parte.test',
    });
    expect(existe.estado).toBe(202);
    expect(noExiste.estado).toBe(202);
    expect(existe.cuerpo).toEqual(noExiste.cuerpo);
  });
});

describe('salud', () => {
  it('healthz no toca la base', async () => {
    const r = await pedir('GET', '/healthz');
    expect(r.estado).toBe(200);
  });

  it('readyz sí', async () => {
    const r = await pedir('GET', '/readyz');
    expect(r.estado).toBe(200);
  });
});
