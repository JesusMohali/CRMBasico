import type { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { autenticar, exigirRol } from '../auth/middleware.js';
import * as servicio from '../auth/service.js';
import * as esquemas from '../auth/schemas.js';
import { enviarInvitacion, enviarResetPassword } from '../lib/email.js';

/**
 * Limite por endpoint. Devuelve `false` cuando el rate limit global esta
 * apagado; si no, un limite por ruta se aplicaria igual aunque el global no.
 */
function limite(max: number, ventana: string) {
  return config.RATE_LIMIT_ENABLED ? { max, timeWindow: ventana } : false;
}

function contextoDe(peticion: FastifyRequest) {
  return {
    ip: peticion.ip,
    userAgent: peticion.headers['user-agent'],
  };
}

export async function rutasAuth(app: FastifyInstance) {
  // ── públicas ───────────────────────────────────────────────────────────────

  app.post('/auth/login', {
    // Límite propio y mucho más estricto que el global: es el endpoint que un
    // atacante golpea para probar contraseñas.
    config: { rateLimit: limite(10, '5 minutes') },
  }, async (peticion) => {
    const datos = esquemas.esquemaLogin.parse(peticion.body);
    // La respuesta lleva el cliente del usuario y ya está: no hay selector que
    // mostrar ni segundo paso, porque no hay más de un cliente entre los que
    // elegir.
    return servicio.login(datos.email, datos.password, contextoDe(peticion));
  });

  app.post('/auth/refresh', {
    config: { rateLimit: limite(30, '5 minutes') },
  }, async (peticion) => {
    const { refreshToken } = esquemas.esquemaRefresh.parse(peticion.body);
    return servicio.refrescar(refreshToken, contextoDe(peticion));
  });

  app.post('/auth/password/forgot', {
    config: { rateLimit: limite(5, '15 minutes') },
  }, async (peticion, respuesta) => {
    const { email } = esquemas.esquemaSolicitarReset.parse(peticion.body);
    const token = await servicio.solicitarResetPassword(email, contextoDe(peticion));

    if (token) {
      // Con el correo apagado (tests y desarrollo local) el token sale por el
      // log: sin buzón al otro lado es la única forma de seguir el flujo. Con el
      // correo activo NUNCA se registra — un token en el log es un token
      // comprometido — y en la respuesta no va jamás.
      if (!config.EMAIL_ENABLED) {
        peticion.log.info({ email, token }, 'token de reset (correo desactivado)');
      }

      // Se espera al envío, pero no puede fallar la petición: enviarResetPassword
      // no lanza (ver lib/email.ts). El token ya está guardado; si SES falla, el
      // usuario puede volver a pedir el enlace.
      await enviarResetPassword(
        { para: email, enlace: `${config.appBaseUrl}/reset-password?token=${encodeURIComponent(token)}` },
        peticion.log,
      );
    }

    // 202 siempre, exista o no el email: si respondiera distinto, este endpoint
    // serviría para averiguar qué cuentas están registradas.
    return respuesta.code(202).send({ mensaje: 'Si el email existe, se envió un enlace' });
  });

  app.post('/auth/password/reset', {
    config: { rateLimit: limite(10, '15 minutes') },
  }, async (peticion) => {
    const datos = esquemas.esquemaConfirmarReset.parse(peticion.body);
    await servicio.confirmarResetPassword(datos.token, datos.password);
    return { mensaje: 'Contraseña actualizada. Todas las sesiones fueron cerradas.' };
  });

  app.post('/auth/invitations/accept', {
    config: { rateLimit: limite(10, '15 minutes') },
  }, async (peticion) => {
    const datos = esquemas.esquemaAceptarInvitacion.parse(peticion.body);
    return servicio.aceptarInvitacion(
      datos.token,
      datos.nombre,
      datos.password,
      contextoDe(peticion),
    );
  });

  // ── autenticadas ───────────────────────────────────────────────────────────

  app.register(async (privadas) => {
    privadas.addHook('preHandler', autenticar);

    privadas.get('/auth/me', async (peticion) => servicio.perfil(peticion.usuario!.id));

    privadas.post('/auth/logout', async (peticion) => {
      const { todas } = esquemas.esquemaLogout.parse(peticion.body ?? {});
      await servicio.cerrarSesion(peticion.usuario!.sesionId, todas, peticion.usuario!.id);
      return { mensaje: todas ? 'Todas las sesiones cerradas' : 'Sesión cerrada' };
    });

    privadas.post('/auth/password/change', async (peticion) => {
      const datos = esquemas.esquemaCambiarPassword.parse(peticion.body);
      await servicio.cambiarPassword(peticion.usuario!.id, datos.actual, datos.nueva);
      return { mensaje: 'Contraseña actualizada. Todas las sesiones fueron cerradas.' };
    });

    // ── administración del cliente: requiere admin ───────────────────────────

    // El tenant sale SIEMPRE del token y nunca de la petición: no hay parámetro
    // que permita apuntar a otro cliente, así que tampoco hay nada que validar.
    privadas.get('/members', { preHandler: exigirRol('member') }, async (peticion) =>
      servicio.listarMiembros(peticion.usuario!.tenantId),
    );

    privadas.post('/members/invitations', { preHandler: exigirRol('admin') }, async (peticion) => {
      const datos = esquemas.esquemaInvitar.parse(peticion.body);
      const invitacion = await servicio.invitar(
        peticion.usuario!.tenantId,
        peticion.usuario!.id,
        datos.email,
        datos.rol,
        contextoDe(peticion),
      );

      // Mismo criterio que en el reset: el token solo aparece en el log cuando no
      // hay envío real.
      if (!config.EMAIL_ENABLED) {
        peticion.log.info(
          { email: datos.email, token: invitacion.token },
          'token de invitación (correo desactivado)',
        );
      }

      // La invitación ya está confirmada en la base. Si el correo no sale, se
      // registra el error y se responde igual: repetir la invitación la reenvía.
      await enviarInvitacion(
        {
          para: datos.email,
          nombreQuienInvita: invitacion.nombreQuienInvita,
          nombreTenant: invitacion.nombreTenant,
          enlace: `${config.appBaseUrl}/accept-invitation?token=${encodeURIComponent(invitacion.token)}`,
        },
        peticion.log,
      );

      return { mensaje: 'Invitación enviada' };
    });

    privadas.patch<{ Params: { usuarioId: string } }>(
      '/members/:usuarioId',
      { preHandler: exigirRol('admin') },
      async (peticion) => {
        const { rol } = esquemas.esquemaCambiarRol.parse(peticion.body);
        await servicio.cambiarRolMiembro(
          peticion.usuario!.tenantId,
          peticion.usuario!.id,
          peticion.params.usuarioId,
          rol,
        );
        return { mensaje: 'Rol actualizado' };
      },
    );

    privadas.delete<{ Params: { usuarioId: string } }>(
      '/members/:usuarioId',
      { preHandler: exigirRol('admin') },
      async (peticion) => {
        await servicio.quitarMiembro(
          peticion.usuario!.tenantId,
          peticion.usuario!.id,
          peticion.params.usuarioId,
        );
        return { mensaje: 'Miembro quitado' };
      },
    );
  });
}
