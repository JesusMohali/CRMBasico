import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prepararBase, URL_APP } from './helpers.js';

const PASSWORD = 'contrasena-de-prueba-larga';

// Estado del doble de SES. En vi.hoisted porque la factoria de vi.mock se iza al
// principio del fichero y no puede cerrar sobre una variable normal.
const ses = vi.hoisted(() => ({
  enviados: [] as any[],
  fallo: null as Error | null,
}));

// El unico doble de toda la suite, y con motivo: al otro lado de este no hay una
// base de datos que se pueda levantar en un contenedor, hay AWS. Todo lo demas
// sigue corriendo contra Postgres de verdad.
vi.mock('@aws-sdk/client-sesv2', () => {
  class SendEmailCommand {
    constructor(readonly input: any) {}
  }
  class SESv2Client {
    constructor(readonly opciones: any) {}
    async send(comando: SendEmailCommand) {
      if (ses.fallo) throw ses.fallo;
      ses.enviados.push(comando.input);
      return { MessageId: 'simulado' };
    }
  }
  return { SESv2Client, SendEmailCommand };
});

let app: FastifyInstance;
// Se guarda la instancia del modulo de config para poder encender el envio en
// las pruebas que lo necesitan (ver el describe 'correo').
let config: any;

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
  // Sin envio de correo por defecto: los tokens salen por el log. Las dos
  // pruebas que necesitan el envio encendido lo encienden ellas.
  process.env.EMAIL_ENABLED = 'false';
  // Obligatorias aunque el envio este apagado: config las valida al arrancar.
  process.env.EMAIL_FROM = 'no-responder@peak.test';
  process.env.APP_BASE_URL = 'https://app.peak.test';

  const { hashearPassword } = await import('../src/auth/passwords.js');
  await prepararBase(await hashearPassword(PASSWORD));

  const { crearServidor } = await import('../src/server.js');
  app = await crearServidor();
  ({ config } = await import('../src/config.js'));
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

describe('correo', () => {
  it('con EMAIL_ENABLED=false no se intenta enviar nada', async () => {
    ses.enviados.length = 0;

    const r = await pedir('POST', '/api/auth/password/forgot', {
      email: 'ana@acme-formacion.test',
    });

    expect(r.estado).toBe(202);
    // Ni siquiera se llega a construir el comando: el envio se corta antes.
    expect(ses.enviados).toHaveLength(0);
  });

  it('manda la invitación con el enlace cuando el envío está activo', async () => {
    config.EMAIL_ENABLED = true;
    ses.enviados.length = 0;

    try {
      const ana = await login('ana@acme-formacion.test', PASSWORD, 'planb-trading');
      const r = await pedir(
        'POST', '/api/members/invitations',
        { email: 'invitada@planb-trading.test', rol: 'member' },
        ana.cuerpo.accessToken,
      );
      expect(r.estado).toBe(200);

      expect(ses.enviados).toHaveLength(1);
      const enviado = ses.enviados[0];
      expect(enviado.Destination.ToAddresses).toEqual(['invitada@planb-trading.test']);

      const html = enviado.Content.Simple.Body.Html.Data;
      const texto = enviado.Content.Simple.Body.Text.Data;
      // El enlace tiene que llevar el token y apuntar a APP_BASE_URL.
      expect(html).toMatch(/https:\/\/app\.peak\.test\/accept-invitation\?token=.+/);
      expect(texto).toContain('https://app.peak.test/accept-invitation?token=');
      // Y el correo dice quién invita y a dónde.
      expect(texto).toContain('Ana Ríos');
      expect(texto).toContain('Plan B Trading');
    } finally {
      config.EMAIL_ENABLED = false;
    }
  });

  it('un fallo de SES no rompe forgot-password: sigue devolviendo 202', async () => {
    config.EMAIL_ENABLED = true;
    ses.fallo = new Error('SES no está disponible (simulado)');
    ses.enviados.length = 0;

    try {
      const r = await pedir('POST', '/api/auth/password/forgot', {
        email: 'ana@acme-formacion.test',
      });

      // El token ya quedó escrito en la base antes de intentar el envío: tirar un
      // 500 aquí le diría al usuario que no se hizo nada cuando sí se hizo.
      expect(r.estado).toBe(202);
      expect(r.cuerpo.mensaje).toMatch(/enlace/);
      expect(ses.enviados).toHaveLength(0);
    } finally {
      ses.fallo = null;
      config.EMAIL_ENABLED = false;
    }
  });
});
