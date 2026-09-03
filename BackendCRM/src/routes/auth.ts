import type { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { autenticar, exigirRol, exigirTenant } from '../auth/middleware.js';
import * as servicio from '../auth/service.js';
import * as esquemas from '../auth/schemas.js';

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
    const resultado = await servicio.login(
      datos.email,
      datos.password,
      datos.tenant,
      contextoDe(peticion),
    );

    return {
      ...resultado,
      // Si tiene varios clientes y no eligió, el front tiene que mostrarle el
      // selector: la sesión está autenticada pero sin tenant activo.
      requiereElegirTenant: resultado.tenant === null && resultado.membresias.length > 1,
    };
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

    // TODO(envío de email): cuando haya proveedor, mandar el enlace con el token.
    // Hasta entonces queda en el log en desarrollo y NUNCA en la respuesta.
    if (token && !config.esProduccion) {
      peticion.log.info({ email, token }, 'token de reset (solo en desarrollo)');
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

    privadas.post('/auth/tenant', async (peticion) => {
      const { tenant } = esquemas.esquemaCambiarTenant.parse(peticion.body);
      return servicio.cambiarTenant(
        peticion.usuario!.id,
        peticion.usuario!.sesionId,
        tenant,
        contextoDe(peticion),
      );
    });

    privadas.post('/auth/password/change', async (peticion) => {
      const datos = esquemas.esquemaCambiarPassword.parse(peticion.body);
      await servicio.cambiarPassword(peticion.usuario!.id, datos.actual, datos.nueva);
      return { mensaje: 'Contraseña actualizada. Todas las sesiones fueron cerradas.' };
    });

    // ── administración del cliente: requiere admin ───────────────────────────

    privadas.get('/members', { preHandler: exigirRol('member') }, async (peticion) =>
      servicio.listarMiembros(exigirTenant(peticion)),
    );

    privadas.post('/members/invitations', { preHandler: exigirRol('admin') }, async (peticion) => {
      const datos = esquemas.esquemaInvitar.parse(peticion.body);
      const token = await servicio.invitar(
        exigirTenant(peticion),
        peticion.usuario!.id,
        datos.email,
        datos.rol,
        contextoDe(peticion),
      );

      // TODO(envío de email): igual que el reset, el token va por correo.
      if (!config.esProduccion) {
        peticion.log.info({ email: datos.email, token }, 'token de invitación (solo en desarrollo)');
      }

      return { mensaje: 'Invitación enviada' };
    });

    privadas.patch<{ Params: { usuarioId: string } }>(
      '/members/:usuarioId',
      { preHandler: exigirRol('admin') },
      async (peticion) => {
        const { rol } = esquemas.esquemaCambiarRol.parse(peticion.body);
        await servicio.cambiarRolMiembro(
          exigirTenant(peticion),
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
          exigirTenant(peticion),
          peticion.usuario!.id,
          peticion.params.usuarioId,
        );
        return { mensaje: 'Miembro quitado' };
      },
    );
  });
}
