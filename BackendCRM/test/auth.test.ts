import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';
import type { FastifyInstance } from 'fastify';
import { CUENTAS, prepararBase, URL_APP } from './helpers.js';

const PASSWORD = 'contrasena-de-prueba-larga';
const SECRETO = 'clave-de-prueba-con-mas-de-treinta-y-dos-caracteres';

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

// El login ya no admite elegir cliente: solo email y contraseña. El cliente lo
// resuelve el servidor, que es justo el punto de este modelo.
const login = (email: string, password = PASSWORD) =>
  pedir('POST', '/api/auth/login', { email, password });

beforeAll(async () => {
  process.env.DATABASE_URL = URL_APP;
  process.env.JWT_SECRET = SECRETO;
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
  it('entra y devuelve el único cliente del usuario', async () => {
    const r = await login(CUENTAS.member);
    expect(r.estado).toBe(200);
    expect(r.cuerpo.tenant.slug).toBe('acme-formacion');
    expect(r.cuerpo.tenant.rol).toBe('member');
    expect(r.cuerpo.accessToken).toBeTruthy();
  });

  it('la respuesta no trae lista de clientes ni rol de plataforma', async () => {
    // Guardia explícita contra una vuelta atrás: si alguien reintroduce el array
    // de membresías o el rol global, esta prueba lo caza. No hay nada que
    // elegir ni ningún privilegio por encima del cliente.
    const r = await login(CUENTAS.adminAcme);
    expect(r.cuerpo.membresias).toBeUndefined();
    expect(r.cuerpo.requiereElegirTenant).toBeUndefined();
    expect(r.cuerpo.usuario.plataforma).toBeUndefined();
  });

  it('un usuario sin membresía activa no entra', async () => {
    // La cuenta existe y la contraseña es correcta: lo que falta es el cliente.
    // Sin él la sesión no representaría nada, así que es 403 y no 200.
    const r = await login(CUENTAS.sinCliente);
    expect(r.estado).toBe(403);
  });

  it('rechaza la contraseña incorrecta', async () => {
    const r = await login(CUENTAS.bloqueo, 'la-que-no-es');
    expect(r.estado).toBe(401);
  });

  it('responde igual ante un email inexistente que ante password mala', async () => {
    const inexistente = await login('nadie@ninguna-parte.test');
    const malaPassword = await login(CUENTAS.bloqueo, 'la-que-no-es');
    // Mismo código y mismo mensaje: no se puede deducir si el email existe.
    expect(inexistente.estado).toBe(malaPassword.estado);
    expect(inexistente.cuerpo.mensaje).toBe(malaPassword.cuerpo.mensaje);
  });

  it('bloquea la cuenta tras varios fallos', async () => {
    for (let i = 0; i < 5; i++) await login(CUENTAS.bloqueo, 'mal');
    const r = await login(CUENTAS.bloqueo);
    expect(r.estado).toBe(429);
    // Que venga del bloqueo de la cuenta y no del rate limit por IP, que
    // devuelve el mismo codigo con otro mensaje.
    expect(r.cuerpo.mensaje).toMatch(/Cuenta bloqueada/);
  });
});

describe('refresh', () => {
  it('rota el token: el viejo deja de valer', async () => {
    const entrada = await login(CUENTAS.member);
    const viejo = entrada.cuerpo.refreshToken;

    const rotado = await pedir('POST', '/api/auth/refresh', { refreshToken: viejo });
    expect(rotado.estado).toBe(200);
    expect(rotado.cuerpo.refreshToken).not.toBe(viejo);

    const reintento = await pedir('POST', '/api/auth/refresh', { refreshToken: viejo });
    expect(reintento.estado).toBe(401);
  });

  it('reutilizar un token revocado mata TODAS las sesiones del usuario', async () => {
    const a = await login(CUENTAS.member);
    const b = await login(CUENTAS.member);

    // Se rota la sesión A, dejando su token viejo revocado.
    const rotado = await pedir('POST', '/api/auth/refresh', { refreshToken: a.cuerpo.refreshToken });
    expect(rotado.estado).toBe(200);

    // Alguien usa el token viejo: se interpreta como robo.
    await pedir('POST', '/api/auth/refresh', { refreshToken: a.cuerpo.refreshToken });

    // La sesión B, que no tenía nada que ver, también cae.
    const sesionB = await pedir('POST', '/api/auth/refresh', { refreshToken: b.cuerpo.refreshToken });
    expect(sesionB.estado).toBe(401);
  });

  it('relee el rol de la base: bajar a alguien surte efecto en el refresh', async () => {
    const victima = await login(CUENTAS.rolCambiante);
    expect(victima.cuerpo.tenant.rol).toBe('member');

    const admin = await login(CUENTAS.adminAcme);
    const bajada = await pedir(
      'PATCH', `/api/members/${victima.cuerpo.usuario.id}`,
      { rol: 'viewer' }, admin.cuerpo.accessToken,
    );
    expect(bajada.estado).toBe(200);

    // Sin esperar a que caduque la sesión de 30 días: el token nuevo ya sale con
    // el rol nuevo porque se relee de la base en cada refresh.
    const refrescado = await pedir('POST', '/api/auth/refresh', {
      refreshToken: victima.cuerpo.refreshToken,
    });
    expect(refrescado.estado).toBe(200);
    expect(refrescado.cuerpo.tenant.rol).toBe('viewer');
  });

  it('a quien sacaron del cliente no se le renueva la sesión', async () => {
    const saliente = await login(CUENTAS.saliente);

    const admin = await login(CUENTAS.adminAcme);
    const baja = await pedir(
      'DELETE', `/api/members/${saliente.cuerpo.usuario.id}`,
      undefined, admin.cuerpo.accessToken,
    );
    expect(baja.estado).toBe(200);

    const refrescado = await pedir('POST', '/api/auth/refresh', {
      refreshToken: saliente.cuerpo.refreshToken,
    });
    // 401: quitar a alguien le revoca las sesiones, así que el token ni siquiera
    // llega a la comprobación de membresía.
    expect(refrescado.estado).toBe(401);
  });
});

describe('aislamiento entre clientes', () => {
  it('cada cliente ve solo a sus miembros', async () => {
    const acme = await login(CUENTAS.adminAcme);
    const planb = await login(CUENTAS.adminPlanb);

    const enAcme = await pedir('GET', '/api/members', undefined, acme.cuerpo.accessToken);
    const enPlanb = await pedir('GET', '/api/members', undefined, planb.cuerpo.accessToken);

    const emailsAcme = enAcme.cuerpo.map((m: any) => m.email);
    const emailsPlanb = enPlanb.cuerpo.map((m: any) => m.email);

    expect(emailsAcme).toContain(CUENTAS.member);
    expect(emailsAcme).not.toContain(CUENTAS.adminPlanb);
    expect(emailsPlanb).toEqual([CUENTAS.adminPlanb]);
  });

  it('un admin no puede cambiarle el rol a alguien de otro cliente', async () => {
    const acme = await login(CUENTAS.adminAcme);
    const planb = await login(CUENTAS.adminPlanb);
    const ajeno = planb.cuerpo.usuario.id;

    const intento = await pedir(
      'PATCH', `/api/members/${ajeno}`, { rol: 'viewer' }, acme.cuerpo.accessToken,
    );
    // 404 y no 403: desde el cliente de Acme ese usuario sencillamente no
    // existe. El tenant sale del token, así que la consulta no lo encuentra.
    expect(intento.estado).toBe(404);

    // Y el rol de verdad no se tocó: sigue entrando como admin de su cliente.
    const despues = await login(CUENTAS.adminPlanb);
    expect(despues.cuerpo.tenant.rol).toBe('admin');
    expect(despues.cuerpo.tenant.slug).toBe('planb-trading');
  });

  it('un admin no puede quitar a un miembro de otro cliente', async () => {
    const acme = await login(CUENTAS.adminAcme);
    const planb = await login(CUENTAS.adminPlanb);

    const intento = await pedir(
      'DELETE', `/api/members/${planb.cuerpo.usuario.id}`, undefined, acme.cuerpo.accessToken,
    );
    expect(intento.estado).toBe(404);

    // Sigue existiendo y con su sesión viva: no se le revocó nada.
    const sigue = await pedir('GET', '/api/members', undefined, planb.cuerpo.accessToken);
    expect(sigue.estado).toBe(200);
    expect(sigue.cuerpo.map((m: any) => m.email)).toContain(CUENTAS.adminPlanb);
  });

  it('no se puede invitar a un email que ya pertenece a otro cliente', async () => {
    const acme = await login(CUENTAS.adminAcme);
    const r = await pedir(
      'POST', '/api/members/invitations',
      { email: CUENTAS.adminPlanb, rol: 'member' },
      acme.cuerpo.accessToken,
    );
    expect(r.estado).toBe(409);
    // El mensaje no dice de QUÉ cliente: si lo dijera, este endpoint serviría
    // para averiguar qué emails pertenecen a clientes ajenos probando uno a uno.
    expect(r.cuerpo.mensaje).not.toMatch(/planb|Plan B/i);
  });

  it('el cliente de la sesión sale del token y no de la petición', async () => {
    // No hay parámetro, cabecera ni cuerpo con el que apuntar a otro cliente:
    // /auth/me responde siempre el del token, se le mande lo que se le mande.
    const acme = await login(CUENTAS.adminAcme);
    const r = await pedir(
      'GET', '/api/auth/me?tenant=planb-trading', undefined, acme.cuerpo.accessToken,
    );
    expect(r.estado).toBe(200);
    expect(r.cuerpo.tenant.slug).toBe('acme-formacion');
  });
});

describe('permisos por rol', () => {
  it('un member no puede invitar y un admin sí', async () => {
    const admin = await login(CUENTAS.adminAcme);
    const comoAdmin = await pedir(
      'POST', '/api/members/invitations',
      { email: 'nueva@acme-formacion.test', rol: 'member' },
      admin.cuerpo.accessToken,
    );
    expect(comoAdmin.estado).toBe(200);

    const member = await login(CUENTAS.member);
    const comoMember = await pedir(
      'POST', '/api/members/invitations',
      { email: 'otra@acme-formacion.test', rol: 'member' },
      member.cuerpo.accessToken,
    );
    expect(comoMember.estado).toBe(403);
  });

  it('un viewer no llega ni a listar los miembros', async () => {
    const viewer = await login(CUENTAS.viewer);
    const r = await pedir('GET', '/api/members', undefined, viewer.cuerpo.accessToken);
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

  it('rechaza un token sin cliente aunque la firma sea buena', async () => {
    // Es la forma que tenían los token del modelo viejo (sesión autenticada sin
    // cliente activo). Firmado con la clave de verdad, pero ya no significa nada:
    // se corta en la verificación y no llega a ningún endpoint.
    const token = await new SignJWT({ sid: 'sesion-inventada' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('usuario-inventado')
      .setIssuedAt()
      .setIssuer('gpi-crm')
      .setAudience('gpi-crm-api')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(SECRETO));

    const r = await pedir('GET', '/api/auth/me', undefined, token);
    expect(r.estado).toBe(401);
  });

  it('/auth/me devuelve el único cliente, no una lista', async () => {
    const admin = await login(CUENTAS.adminAcme);
    const r = await pedir('GET', '/api/auth/me', undefined, admin.cuerpo.accessToken);
    expect(r.estado).toBe(200);
    expect(r.cuerpo.email).toBe(CUENTAS.adminAcme);
    expect(r.cuerpo.tenant.slug).toBe('acme-formacion');
    expect(r.cuerpo.tenant.rol).toBe('admin');
    expect(r.cuerpo.membresias).toBeUndefined();
    expect(r.cuerpo.plataforma).toBeUndefined();
  });
});

describe('contraseñas', () => {
  it('cambiarla cierra todas las sesiones', async () => {
    const entrada = await login(CUENTAS.password);
    const otra = await login(CUENTAS.password);

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
    const existe = await pedir('POST', '/api/auth/password/forgot', { email: CUENTAS.adminAcme });
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

    const r = await pedir('POST', '/api/auth/password/forgot', { email: CUENTAS.adminAcme });

    expect(r.estado).toBe(202);
    // Ni siquiera se llega a construir el comando: el envio se corta antes.
    expect(ses.enviados).toHaveLength(0);
  });

  it('manda la invitación con el enlace cuando el envío está activo', async () => {
    config.EMAIL_ENABLED = true;
    ses.enviados.length = 0;

    try {
      const admin = await login(CUENTAS.adminAcme);
      const r = await pedir(
        'POST', '/api/members/invitations',
        { email: 'invitada@acme-formacion.test', rol: 'member' },
        admin.cuerpo.accessToken,
      );
      expect(r.estado).toBe(200);

      expect(ses.enviados).toHaveLength(1);
      const enviado = ses.enviados[0];
      expect(enviado.Destination.ToAddresses).toEqual(['invitada@acme-formacion.test']);

      const html = enviado.Content.Simple.Body.Html.Data;
      const texto = enviado.Content.Simple.Body.Text.Data;
      // El enlace tiene que llevar el token y apuntar a APP_BASE_URL.
      expect(html).toMatch(/https:\/\/app\.peak\.test\/accept-invitation\?token=.+/);
      expect(texto).toContain('https://app.peak.test/accept-invitation?token=');
      // Y el correo dice quién invita y a dónde.
      expect(texto).toContain('Admin Acme Formación');
      expect(texto).toContain('Acme Formación');
    } finally {
      config.EMAIL_ENABLED = false;
    }
  });

  it('un fallo de SES no rompe forgot-password: sigue devolviendo 202', async () => {
    config.EMAIL_ENABLED = true;
    ses.fallo = new Error('SES no está disponible (simulado)');
    ses.enviados.length = 0;

    try {
      const r = await pedir('POST', '/api/auth/password/forgot', { email: CUENTAS.adminAcme });

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
