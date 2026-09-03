import { randomBytes } from 'node:crypto';
import { enTransaccion, type Ejecutor } from '../db/pool.js';
import { config } from '../config.js';
import {
  conflicto,
  noAutorizado,
  noEncontrado,
  peticionInvalida,
  prohibido,
  demasiadosIntentos,
} from '../lib/errors.js';
import { gastarTiempoDeVerificacion, hashearPassword, verificarPassword } from './passwords.js';
import { firmarAccessToken, generarRefreshToken, hashearToken } from './tokens.js';
import type { EstadoUsuario, RolTenant } from './tipos.js';

interface FilaUsuario {
  id: string;
  email: string;
  password_hash: string | null;
  full_name: string;
  status: EstadoUsuario;
  locked_until: Date | null;
  failed_login_attempts: number;
}

/** El cliente al que pertenece el usuario, con su rol. Es uno y solo uno. */
export interface Membresia {
  tenantId: string;
  slug: string;
  nombre: string;
  rol: RolTenant;
}

export interface ParDeTokens {
  accessToken: string;
  refreshToken: string;
  expiraEn: number;
  // No es nulable: sin cliente no hay sesión que emitir. Quien no tenga una
  // membresía activa no entra, así que aquí siempre hay un tenant.
  tenant: Membresia;
  usuario: { id: string; email: string; nombre: string };
}

interface Contexto {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

// ── consultas auxiliares ─────────────────────────────────────────────────────

async function buscarUsuarioPorEmail(cliente: Ejecutor, email: string) {
  const { rows } = await cliente.query<FilaUsuario>(
    `SELECT id, email, password_hash, full_name, status, locked_until, failed_login_attempts
       FROM auth.users WHERE email = $1`,
    [email],
  );
  return rows[0] ?? null;
}

/**
 * La membresía del usuario, o null si no tiene ninguna utilizable.
 *
 * Devuelve una sola fila porque un usuario pertenece como mucho a un cliente: lo
 * garantiza el índice único sobre tenant_memberships (user_id) que aplica infra.
 * El LIMIT 1 no elige entre varias, solo hace explícito que aquí se espera una.
 *
 * Filtra por estado de la membresía Y por estado del tenant: una membresía
 * activa en un cliente suspendido no da acceso a nada.
 */
async function membresiaDe(cliente: Ejecutor, usuarioId: string): Promise<Membresia | null> {
  const { rows } = await cliente.query<Membresia>(
    `SELECT t.id AS "tenantId", t.slug, t.name AS nombre, m.role AS rol
       FROM auth.tenant_memberships m
       JOIN auth.tenants t ON t.id = m.tenant_id
      WHERE m.user_id = $1
        AND m.status = 'active'
        AND t.status IN ('trial', 'active')
      LIMIT 1`,
    [usuarioId],
  );
  return rows[0] ?? null;
}

async function registrar(
  cliente: Ejecutor,
  datos: {
    actorId: string | null;
    tenantId: string | null;
    accion: string;
    tipoObjetivo?: string;
    idObjetivo?: string;
    metadata?: Record<string, unknown>;
    ip?: string | undefined;
  },
) {
  await cliente.query(
    `INSERT INTO auth.audit_log (actor_id, tenant_id, action, target_type, target_id, metadata, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      datos.actorId,
      datos.tenantId,
      datos.accion,
      datos.tipoObjetivo ?? null,
      datos.idObjetivo ?? null,
      JSON.stringify(datos.metadata ?? {}),
      datos.ip ?? null,
    ],
  );
}

/** Crea la sesión y devuelve el par de tokens. */
async function emitirSesion(
  cliente: Ejecutor,
  usuario: { id: string; email: string; full_name: string },
  tenant: Membresia,
  contexto: Contexto,
): Promise<ParDeTokens> {
  const refreshToken = generarRefreshToken();
  const expiraEn = new Date(Date.now() + config.REFRESH_TOKEN_TTL_SECONDS * 1000);

  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO auth.sessions (user_id, tenant_id, token_hash, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      usuario.id,
      tenant.tenantId,
      hashearToken(refreshToken),
      expiraEn,
      contexto.ip ?? null,
      contexto.userAgent ?? null,
    ],
  );

  const sesionId = rows[0]!.id;

  const accessToken = await firmarAccessToken({
    sub: usuario.id,
    sid: sesionId,
    tid: tenant.tenantId,
    rol: tenant.rol,
  });

  return {
    accessToken,
    refreshToken,
    expiraEn: config.ACCESS_TOKEN_TTL_SECONDS,
    tenant,
    usuario: {
      id: usuario.id,
      email: usuario.email,
      nombre: usuario.full_name,
    },
  };
}

// ── login ────────────────────────────────────────────────────────────────────

export async function login(
  email: string,
  password: string,
  contexto: Contexto,
): Promise<ParDeTokens> {
  const usuario = await enTransaccion((cliente) => buscarUsuarioPorEmail(cliente, email));

  // El email no existe: se gasta el mismo tiempo que costaría verificar un hash
  // real antes de responder. Sin esto, la diferencia de latencia permite
  // enumerar qué cuentas están registradas.
  if (!usuario || !usuario.password_hash) {
    await gastarTiempoDeVerificacion();
    throw noAutorizado(`login fallido: email inexistente o sin password (${email})`);
  }

  if (usuario.locked_until && usuario.locked_until > new Date()) {
    throw demasiadosIntentos('Cuenta bloqueada temporalmente por intentos fallidos');
  }

  const correcta = await verificarPassword(usuario.password_hash, password);

  if (!correcta) {
    const intentos = usuario.failed_login_attempts + 1;
    const bloquear = intentos >= config.MAX_FAILED_LOGINS;

    // En transacción PROPIA, que se confirma antes de rechazar la petición. Si
    // el contador se incrementara en la misma transacción que termina en throw,
    // el ROLLBACK lo revertiría y la cuenta no se bloquearía nunca por muchos
    // intentos que hiciera el atacante.
    await enTransaccion(async (cliente) => {
      await cliente.query(
        `UPDATE auth.users
            SET failed_login_attempts = $2,
                locked_until = CASE WHEN $3 THEN now() + make_interval(secs => $4) ELSE locked_until END
          WHERE id = $1`,
        [usuario.id, bloquear ? 0 : intentos, bloquear, config.LOCKOUT_SECONDS],
      );
      await registrar(cliente, {
        actorId: usuario.id,
        tenantId: null,
        accion: 'auth.login.fallido',
        metadata: { intentos, bloqueada: bloquear },
        ip: contexto.ip,
      });
    });

    throw noAutorizado(`password incorrecta (${email}, intento ${intentos})`);
  }

  // El estado se comprueba DESPUÉS de verificar la contraseña: responder "cuenta
  // deshabilitada" sin comprobarla convertiría el login en un enumerador de
  // cuentas registradas.
  if (usuario.status !== 'active') {
    throw prohibido(`cuenta en estado ${usuario.status} (${email})`);
  }

  return enTransaccion(async (cliente) => {
    // No hay nada que elegir ni que pedir: el cliente del usuario es el único que
    // tiene. Sin membresía activa no hay a dónde entrar — la cuenta existe y la
    // contraseña es correcta, pero no pertenece a ningún cliente, así que la
    // sesión no representaría nada. El alta de usuarios la hace el backoffice.
    const tenant = await membresiaDe(cliente, usuario.id);
    if (!tenant) {
      throw prohibido(`usuario sin membresía activa (${email})`);
    }

    await cliente.query(
      `UPDATE auth.users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = now()
        WHERE id = $1`,
      [usuario.id],
    );

    const tokens = await emitirSesion(cliente, usuario, tenant, contexto);

    await registrar(cliente, {
      actorId: usuario.id,
      tenantId: tenant.tenantId,
      accion: 'auth.login',
      ip: contexto.ip,
    });

    return tokens;
  });
}

// ── refresh, con rotación y detección de reutilización ───────────────────────

export async function refrescar(refreshToken: string, contexto: Contexto): Promise<ParDeTokens> {
  const tokenHash = hashearToken(refreshToken);

  // La detección de reutilización va en su PROPIA transacción, aparte de la
  // rotación. Un token ya revocado que reaparece significa que alguien tiene una
  // copia: o el usuario legítimo con un token viejo, o quien se lo robó. No se
  // pueden distinguir, así que se cortan TODAS las sesiones del usuario.
  //
  // Y esa revocación tiene que quedar CONFIRMADA aunque la petición se rechace.
  // Si fuera dentro de la misma transacción, el throw haría ROLLBACK justo de lo
  // que se acaba de revocar y la contramedida no serviría de nada.
  const reutilizado = await enTransaccion(async (cliente) => {
    const { rows } = await cliente.query<{ id: string; user_id: string; tenant_id: string | null }>(
      `SELECT id, user_id, tenant_id FROM auth.sessions
        WHERE token_hash = $1 AND revoked_at IS NOT NULL`,
      [tokenHash],
    );
    const sesion = rows[0];
    if (!sesion) return null;

    await cliente.query(
      'UPDATE auth.sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
      [sesion.user_id],
    );
    await registrar(cliente, {
      actorId: sesion.user_id,
      tenantId: sesion.tenant_id,
      accion: 'auth.refresh.reutilizado',
      metadata: { sesionRevocada: sesion.id },
      ip: contexto.ip,
    });
    return sesion.user_id;
  });

  if (reutilizado) {
    throw noAutorizado(`refresh token reutilizado; sesiones de ${reutilizado} revocadas`);
  }

  return enTransaccion(async (cliente) => {
    // FOR UPDATE: dos peticiones simultáneas con el mismo token no pueden rotar
    // las dos. La segunda espera, encuentra la fila ya revocada y cae en la
    // detección de reutilización del próximo intento.
    const { rows } = await cliente.query<{
      id: string;
      user_id: string;
      tenant_id: string | null;
      expires_at: Date;
      revoked_at: Date | null;
    }>(
      `SELECT id, user_id, tenant_id, expires_at, revoked_at
         FROM auth.sessions WHERE token_hash = $1 FOR UPDATE`,
      [tokenHash],
    );

    const sesion = rows[0];
    if (!sesion) throw noAutorizado('refresh token desconocido');
    if (sesion.revoked_at) throw noAutorizado('refresh token revocado');
    if (sesion.expires_at <= new Date()) throw noAutorizado('refresh token caducado');

    const { rows: filasUsuario } = await cliente.query<FilaUsuario>(
      'SELECT id, email, password_hash, full_name, status, locked_until, failed_login_attempts FROM auth.users WHERE id = $1',
      [sesion.user_id],
    );
    const usuario = filasUsuario[0];
    if (!usuario || usuario.status !== 'active') {
      throw noAutorizado('usuario inactivo');
    }

    // El rol se relee de la base en cada refresh, no se arrastra del token: si a
    // alguien lo bajaron de admin a viewer, el cambio surte efecto en el próximo
    // refresh y no cuando caduque una sesión de 30 días.
    const tenant = await membresiaDe(cliente, usuario.id);
    if (!tenant) throw prohibido('la membresía ya no está activa');

    // Y se comprueba que siga siendo el MISMO cliente con el que se abrió la
    // sesión. Si a alguien lo quitaron de un cliente y lo dieron de alta en otro,
    // su refresh token viejo no puede convertirse solo en una sesión del cliente
    // nuevo: eso entra por un login.
    if (sesion.tenant_id !== tenant.tenantId) {
      throw prohibido('la sesión es de otro cliente');
    }

    // Rotación: la sesión vieja se revoca y se emite una nueva.
    await cliente.query('UPDATE auth.sessions SET revoked_at = now() WHERE id = $1', [sesion.id]);

    return emitirSesion(cliente, usuario, tenant, contexto);
  });
}

// ── logout ───────────────────────────────────────────────────────────────────

export async function cerrarSesion(sesionId: string, todas: boolean, usuarioId: string) {
  await enTransaccion(async (cliente) => {
    if (todas) {
      await cliente.query(
        'UPDATE auth.sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
        [usuarioId],
      );
    } else {
      await cliente.query(
        'UPDATE auth.sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL',
        [sesionId],
      );
    }
    await registrar(cliente, {
      actorId: usuarioId,
      tenantId: null,
      accion: todas ? 'auth.logout.todas' : 'auth.logout',
    });
  });
}

// ── perfil ───────────────────────────────────────────────────────────────────

export async function perfil(usuarioId: string) {
  return enTransaccion(async (cliente) => {
    const { rows } = await cliente.query(
      `SELECT id, email, full_name AS nombre, status AS estado,
              email_verified_at AS "emailVerificadoEn", last_login_at AS "ultimoLogin"
         FROM auth.users WHERE id = $1`,
      [usuarioId],
    );
    const usuario = rows[0];
    if (!usuario) throw noEncontrado('usuario');

    // Un tenant, no una lista. Sale null solo en el hueco entre que a alguien le
    // quitan la membresía y le caduca el access token que ya tenía en la mano:
    // /auth/me es de lectura y no da acceso a datos del cliente, así que no hace
    // falta cortar la petición, basta con decir la verdad.
    return { ...usuario, tenant: await membresiaDe(cliente, usuarioId) };
  });
}

// ── cambio de contraseña ─────────────────────────────────────────────────────

export async function cambiarPassword(usuarioId: string, actual: string, nueva: string) {
  await enTransaccion(async (cliente) => {
    const { rows } = await cliente.query<FilaUsuario>(
      'SELECT id, email, password_hash, full_name, status, locked_until, failed_login_attempts FROM auth.users WHERE id = $1',
      [usuarioId],
    );
    const usuario = rows[0];
    if (!usuario?.password_hash) throw noAutorizado('usuario sin contraseña');

    if (!(await verificarPassword(usuario.password_hash, actual))) {
      throw noAutorizado('la contraseña actual no coincide');
    }

    await cliente.query('UPDATE auth.users SET password_hash = $2 WHERE id = $1', [
      usuarioId,
      await hashearPassword(nueva),
    ]);

    // Cambiar la contraseña cierra todas las sesiones. Es el gesto que hace
    // alguien que cree que le entraron, y no serviría de nada si las sesiones
    // del atacante siguieran vivas.
    await cliente.query(
      'UPDATE auth.sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
      [usuarioId],
    );

    await registrar(cliente, { actorId: usuarioId, tenantId: null, accion: 'auth.password.cambiada' });
  });
}

// ── recuperación de contraseña ───────────────────────────────────────────────

/**
 * Devuelve el token en claro para que la capa de envío lo mande por email.
 * Devuelve null si el email no existe — y el endpoint responde 202 igualmente,
 * porque distinguir "te mandamos el correo" de "ese email no existe" convierte
 * este endpoint en un enumerador de cuentas.
 */
export async function solicitarResetPassword(
  email: string,
  contexto: Contexto,
): Promise<string | null> {
  return enTransaccion(async (cliente) => {
    const usuario = await buscarUsuarioPorEmail(cliente, email);
    if (!usuario || usuario.status === 'disabled') return null;

    const token = randomBytes(32).toString('base64url');

    await cliente.query(
      `INSERT INTO auth.password_resets (user_id, token_hash, expires_at, requested_ip)
       VALUES ($1, $2, now() + make_interval(secs => $3), $4)`,
      [usuario.id, hashearToken(token), config.PASSWORD_RESET_TTL_SECONDS, contexto.ip ?? null],
    );

    await registrar(cliente, {
      actorId: usuario.id,
      tenantId: null,
      accion: 'auth.password.reset.solicitado',
      ip: contexto.ip,
    });

    return token;
  });
}

export async function confirmarResetPassword(token: string, nueva: string) {
  await enTransaccion(async (cliente) => {
    const { rows } = await cliente.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM auth.password_resets
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
      [hashearToken(token)],
    );
    const reset = rows[0];
    if (!reset) throw peticionInvalida('El enlace es inválido o ya caducó');

    await cliente.query('UPDATE auth.password_resets SET used_at = now() WHERE id = $1', [reset.id]);

    await cliente.query(
      `UPDATE auth.users
          SET password_hash = $2, status = 'active', failed_login_attempts = 0, locked_until = NULL
        WHERE id = $1`,
      [reset.user_id, await hashearPassword(nueva)],
    );

    await cliente.query(
      'UPDATE auth.sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
      [reset.user_id],
    );

    await registrar(cliente, {
      actorId: reset.user_id,
      tenantId: null,
      accion: 'auth.password.reset.confirmado',
    });
  });
}

// ── invitaciones ─────────────────────────────────────────────────────────────

/**
 * Devuelve el token en claro y, con él, los nombres que necesita el correo de
 * invitación. Salen de aquí y no de una consulta aparte en la ruta porque ya
 * estamos dentro de la transacción que lee esas dos filas: pedirlas fuera serían
 * dos viajes más a la base para datos que aquí están a mano.
 */
export interface InvitacionCreada {
  token: string;
  nombreQuienInvita: string;
  nombreTenant: string;
}

export async function invitar(
  tenantId: string,
  invitadorId: string,
  email: string,
  rol: RolTenant,
  contexto: Contexto,
): Promise<InvitacionCreada> {
  return enTransaccion(async (cliente) => {
    // Solo el owner puede crear otro owner, y de todos modos la base solo admite
    // uno por tenant (índice único parcial memberships_un_solo_owner).
    if (rol === 'owner') {
      throw peticionInvalida('El rol owner se transfiere, no se invita');
    }

    // Se mira si el email pertenece a ALGÚN cliente, no solo a este: como cada
    // usuario pertenece a uno como mucho, una invitación a alguien que ya está en
    // otro cliente nunca podría aceptarse (chocaría contra el índice único), y
    // vale más rechazarla aquí que dejar que reviente al aceptarla.
    //
    // El mensaje es el mismo en los dos casos a propósito. Si dijera "ya está en
    // otro cliente", este endpoint le serviría a cualquier admin para averiguar
    // qué emails pertenecen a clientes ajenos, probando uno a uno.
    const { rows: yaEsta } = await cliente.query(
      `SELECT 1 FROM auth.tenant_memberships m
         JOIN auth.users u ON u.id = m.user_id
        WHERE u.email = $1`,
      [email],
    );
    if (yaEsta.length > 0) throw conflicto('Ese email ya pertenece a un cliente');

    const token = randomBytes(32).toString('base64url');

    await cliente.query(
      `INSERT INTO auth.invitations (tenant_id, email, role, token_hash, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, now() + make_interval(secs => $6))
       ON CONFLICT (tenant_id, email) WHERE accepted_at IS NULL
       DO UPDATE SET token_hash = EXCLUDED.token_hash,
                     role       = EXCLUDED.role,
                     expires_at = EXCLUDED.expires_at,
                     invited_by = EXCLUDED.invited_by`,
      [tenantId, email, rol, hashearToken(token), invitadorId, config.INVITATION_TTL_SECONDS],
    );

    await registrar(cliente, {
      actorId: invitadorId,
      tenantId,
      accion: 'auth.invitacion.creada',
      tipoObjetivo: 'email',
      idObjetivo: email,
      metadata: { rol },
      ip: contexto.ip,
    });

    // Dos subconsultas en una sola ida a la base. Ambas columnas son NOT NULL y
    // los ids vienen de una sesión válida, así que la fila existe.
    const { rows: nombres } = await cliente.query<{ invitador: string; tenant: string }>(
      `SELECT (SELECT full_name FROM auth.users   WHERE id = $1) AS invitador,
              (SELECT name      FROM auth.tenants WHERE id = $2) AS tenant`,
      [invitadorId, tenantId],
    );

    return {
      token,
      nombreQuienInvita: nombres[0]!.invitador,
      nombreTenant: nombres[0]!.tenant,
    };
  });
}

export async function aceptarInvitacion(
  token: string,
  nombre: string,
  password: string,
  contexto: Contexto,
): Promise<ParDeTokens> {
  return enTransaccion(async (cliente) => {
    const { rows } = await cliente.query<{
      id: string;
      tenant_id: string;
      email: string;
      role: RolTenant;
    }>(
      `SELECT id, tenant_id, email, role FROM auth.invitations
        WHERE token_hash = $1 AND accepted_at IS NULL AND expires_at > now()`,
      [hashearToken(token)],
    );
    const invitacion = rows[0];
    if (!invitacion) throw peticionInvalida('La invitación es inválida o ya caducó');

    // Si la persona ya tenía cuenta, se reutiliza: una identidad por persona. Lo
    // que ya no puede pasar es que esa cuenta esté en otro cliente — el índice
    // único lo impediría con un error de base — así que se comprueba antes y se
    // responde algo que se entienda. Aquí sí se puede ser explícito: quien acepta
    // es el dueño de la cuenta, no un tercero fisgoneando.
    const existente = await buscarUsuarioPorEmail(cliente, invitacion.email);

    let usuarioId: string;
    if (existente) {
      usuarioId = existente.id;

      const { rows: enOtro } = await cliente.query(
        'SELECT 1 FROM auth.tenant_memberships WHERE user_id = $1 AND tenant_id <> $2',
        [usuarioId, invitacion.tenant_id],
      );
      if (enOtro.length > 0) {
        throw conflicto('Esa cuenta ya pertenece a otro cliente');
      }

      if (!existente.password_hash) {
        await cliente.query(
          `UPDATE auth.users SET password_hash = $2, full_name = $3, status = 'active',
                                 email_verified_at = now()
            WHERE id = $1`,
          [usuarioId, await hashearPassword(password), nombre],
        );
      }
    } else {
      const { rows: nuevo } = await cliente.query<{ id: string }>(
        `INSERT INTO auth.users (email, full_name, password_hash, status, email_verified_at)
         VALUES ($1, $2, $3, 'active', now()) RETURNING id`,
        [invitacion.email, nombre, await hashearPassword(password)],
      );
      usuarioId = nuevo[0]!.id;
    }

    await cliente.query(
      `INSERT INTO auth.tenant_memberships (tenant_id, user_id, role, status)
       VALUES ($1, $2, $3, 'active')
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active'`,
      [invitacion.tenant_id, usuarioId, invitacion.role],
    );

    await cliente.query(
      'UPDATE auth.invitations SET accepted_at = now(), accepted_by = $2 WHERE id = $1',
      [invitacion.id, usuarioId],
    );

    // Se relee en vez de construirla a mano: hace falta el nombre y el estado del
    // tenant, y así la respuesta del alta es idéntica a la de un login.
    const tenant = await membresiaDe(cliente, usuarioId);
    if (!tenant) throw prohibido('el cliente de la invitación no está activo');

    const { rows: filasUsuario } = await cliente.query<FilaUsuario>(
      'SELECT id, email, password_hash, full_name, status, locked_until, failed_login_attempts FROM auth.users WHERE id = $1',
      [usuarioId],
    );

    await registrar(cliente, {
      actorId: usuarioId,
      tenantId: invitacion.tenant_id,
      accion: 'auth.invitacion.aceptada',
      ip: contexto.ip,
    });

    return emitirSesion(cliente, filasUsuario[0]!, tenant, contexto);
  });
}

// ── gestión de miembros ──────────────────────────────────────────────────────

export async function listarMiembros(tenantId: string) {
  return enTransaccion(async (cliente) => {
    const { rows } = await cliente.query(
      `SELECT u.id, u.email, u.full_name AS nombre, u.status AS estado,
              m.role AS rol, m.status AS "estadoMembresia", m.created_at AS "desde"
         FROM auth.tenant_memberships m
         JOIN auth.users u ON u.id = m.user_id
        WHERE m.tenant_id = $1
        ORDER BY u.full_name`,
      [tenantId],
    );
    return rows;
  });
}

export async function cambiarRolMiembro(
  tenantId: string,
  actorId: string,
  usuarioId: string,
  rol: RolTenant,
) {
  await enTransaccion(async (cliente) => {
    if (usuarioId === actorId) throw peticionInvalida('No podés cambiarte el rol a vos mismo');
    if (rol === 'owner') throw peticionInvalida('El rol owner se transfiere aparte');

    const { rowCount } = await cliente.query(
      `UPDATE auth.tenant_memberships SET role = $3
        WHERE tenant_id = $1 AND user_id = $2 AND role <> 'owner'`,
      [tenantId, usuarioId, rol],
    );
    if (rowCount === 0) throw noEncontrado('membresía (o es el owner)');

    await registrar(cliente, {
      actorId,
      tenantId,
      accion: 'auth.miembro.rol.cambiado',
      tipoObjetivo: 'user',
      idObjetivo: usuarioId,
      metadata: { rol },
    });
  });
}

export async function quitarMiembro(tenantId: string, actorId: string, usuarioId: string) {
  await enTransaccion(async (cliente) => {
    if (usuarioId === actorId) throw peticionInvalida('No podés quitarte a vos mismo');

    const { rowCount } = await cliente.query(
      `DELETE FROM auth.tenant_memberships
        WHERE tenant_id = $1 AND user_id = $2 AND role <> 'owner'`,
      [tenantId, usuarioId],
    );
    if (rowCount === 0) throw noEncontrado('membresía (o es el owner, que no se puede quitar)');

    // Todas sus sesiones dejan de valer, sin filtrar por tenant: solo pertenecía a
    // este cliente, así que no hay ninguna otra que preservar. Filtrar por
    // tenant_id dejaría viva cualquier sesión heredada del modelo anterior.
    await cliente.query(
      'UPDATE auth.sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
      [usuarioId],
    );

    await registrar(cliente, {
      actorId,
      tenantId,
      accion: 'auth.miembro.quitado',
      tipoObjetivo: 'user',
      idObjetivo: usuarioId,
    });
  });
}
