import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { config } from '../config.js';

/**
 * Envío de correo transaccional por Amazon SES (API v2).
 *
 * Solo dos correos por ahora —invitación y recuperación de contraseña— y los dos
 * tienen la misma forma: un texto corto y un enlace que hay que abrir. De ahí que
 * la maquetación esté factorizada en una plantilla única en vez de duplicada.
 *
 * Sin imágenes externas ni CSS remoto: los clientes de correo bloquean lo primero
 * por defecto (y avisan al usuario de que "este mensaje contiene contenido
 * remoto", que en un correo de recuperación de contraseña asusta) y no cargan lo
 * segundo. Todo va inline.
 */

/**
 * Lo mínimo que este módulo necesita de un logger. Se le pasa el de la petición
 * (`peticion.log`) para que las líneas del envío queden correlacionadas con el
 * reqId de quien lo provocó, en vez de aparecer sueltas en el log.
 */
export interface RegistroLog {
  info(datos: object, mensaje?: string): void;
  error(datos: object, mensaje?: string): void;
}

/**
 * Registro de reserva para cuando se llama sin logger. Un envío que falla y no
 * deja rastro en ningún sitio es peor que el fallo en sí: el correo no llega y
 * nadie se entera nunca de por qué.
 */
const registroPorDefecto: RegistroLog = {
  info: (datos, mensaje) => console.info(mensaje ?? 'correo', datos),
  error: (datos, mensaje) => console.error(mensaje ?? 'correo', datos),
};

interface Correo {
  para: string;
  asunto: string;
  html: string;
  texto: string;
}

// Un único cliente para todo el proceso: mantiene vivo el pool de conexiones
// HTTPS y la cadena de credenciales ya resuelta. Uno por envío pagaría el
// handshake TLS en cada correo.
//
// Se construye la primera vez que hace falta y no al importar el módulo: con
// EMAIL_ENABLED=false (tests, desarrollo local) no llega a existir, así que la
// suite no necesita credenciales de AWS ni región válida.
let cliente: SESv2Client | null = null;

function clienteSes(): SESv2Client {
  cliente ??= new SESv2Client({ region: config.AWS_REGION });
  return cliente;
}

// El display-name va entrecomillado: sin comillas, un nombre con una coma
// partiría la cabecera From en dos direcciones y SES rechazaría el envío.
const remitente = `"${config.EMAIL_FROM_NAME.replace(/["\\]/g, '')}" <${config.EMAIL_FROM}>`;

/**
 * Escapa lo que va interpolado en el HTML. El nombre del cliente y el de quien
 * invita salen de la base, o sea de algo que escribió una persona: sin escapar,
 * un nombre con `<` rompe la maqueta y abre la puerta a inyectar marcado en el
 * correo de otro.
 */
function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * "7 días", "1 hora", "30 minutos"… a partir de los segundos que hay en config.
 * El plazo se calcula y no se escribe a mano para que el texto del correo no
 * mienta si alguien cambia el TTL por variable de entorno.
 */
function duracionLegible(segundos: number): string {
  if (segundos >= 86_400) {
    const dias = Math.round(segundos / 86_400);
    return dias === 1 ? '1 día' : `${dias} días`;
  }
  if (segundos >= 3_600) {
    const horas = Math.round(segundos / 3_600);
    return horas === 1 ? '1 hora' : `${horas} horas`;
  }
  const minutos = Math.max(1, Math.round(segundos / 60));
  return minutos === 1 ? '1 minuto' : `${minutos} minutos`;
}

/**
 * Maqueta común. El enlace aparece dos veces a propósito: como botón y como URL
 * en claro debajo. Los clientes que no pintan el botón (o el usuario que
 * desconfía de un botón) siguen teniendo la dirección a la vista, y así se puede
 * copiar y pegar cuando el correo se lee en otro dispositivo.
 */
function maquetar(partes: {
  titulo: string;
  parrafos: string[];
  textoBoton: string;
  enlace: string;
  caducidad: string;
  cierre: string;
}): string {
  const parrafos = partes.parrafos
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1f2933;">${p}</p>`)
    .join('\n      ');

  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escaparHtml(partes.titulo)}</title></head>
<body style="margin:0;padding:24px;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background-color:#ffffff;border:1px solid #e4e7eb;border-radius:8px;padding:32px;">
    <h1 style="margin:0 0 24px;font-size:19px;font-weight:600;color:#0b1215;">${escaparHtml(partes.titulo)}</h1>
    <div>
      ${parrafos}
    </div>
    <p style="margin:28px 0;">
      <a href="${escaparHtml(partes.enlace)}" style="display:inline-block;padding:12px 22px;background-color:#0b1215;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:600;">${escaparHtml(partes.textoBoton)}</a>
    </p>
    <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#616e7c;">Si el botón no funciona, copiá y pegá esta dirección en el navegador:</p>
    <p style="margin:0 0 24px;font-size:13px;line-height:1.5;word-break:break-all;"><a href="${escaparHtml(partes.enlace)}" style="color:#1f6feb;">${escaparHtml(partes.enlace)}</a></p>
    <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#616e7c;">${escaparHtml(partes.caducidad)}</p>
    <p style="margin:0;font-size:13px;line-height:1.5;color:#616e7c;">${escaparHtml(partes.cierre)}</p>
    <hr style="border:none;border-top:1px solid #e4e7eb;margin:28px 0 16px;">
    <p style="margin:0;font-size:12px;color:#9aa5b1;">${escaparHtml(config.EMAIL_FROM_NAME)} · Este correo es automático, no hace falta responderlo.</p>
  </div>
</body>
</html>`;
}

/**
 * Manda el correo. Nunca lanza.
 *
 * Un fallo de SES NO puede tumbar la petición: para cuando se llama aquí, la
 * invitación (o el token de recuperación) ya está escrita y confirmada en la
 * base. Devolver un 500 le diría al usuario que no se hizo nada cuando en
 * realidad sí se hizo — y al reintentar se encontraría con un "esa persona ya
 * pertenece a este cliente". El estado bueno es el de la base; el correo se
 * puede reenviar. Así que el fallo se registra con log.error y la petición sigue
 * su curso.
 */
async function enviar(correo: Correo, log: RegistroLog = registroPorDefecto): Promise<void> {
  // El asunto lleva dentro el nombre de quien invita, que lo escribió una
  // persona. Un salto de línea ahí es un intento de partir la cabecera Subject y
  // colar otra: se aplastan a espacios antes de que el asunto llegue a SES.
  const asunto = correo.asunto.replace(/[\r\n]+/g, ' ').trim();

  if (!config.EMAIL_ENABLED) {
    log.info(
      { para: correo.para, asunto },
      'envío de correo desactivado (EMAIL_ENABLED=false), no se manda nada',
    );
    return;
  }

  try {
    await clienteSes().send(
      new SendEmailCommand({
        FromEmailAddress: remitente,
        Destination: { ToAddresses: [correo.para] },
        // El configuration set es lo que engancha rebotes y quejas a SNS. Solo
        // se manda si está configurado: SES rechaza el envío si se le nombra uno
        // que no existe.
        ...(config.SES_CONFIGURATION_SET
          ? { ConfigurationSetName: config.SES_CONFIGURATION_SET }
          : {}),
        Content: {
          Simple: {
            Subject: { Data: asunto, Charset: 'UTF-8' },
            Body: {
              // Las dos versiones. La de texto no es decorativa: sin ella los
              // filtros antispam puntúan peor el mensaje.
              Text: { Data: correo.texto, Charset: 'UTF-8' },
              Html: { Data: correo.html, Charset: 'UTF-8' },
            },
          },
        },
      }),
    );

    log.info({ para: correo.para, asunto }, 'correo enviado');
  } catch (error) {
    log.error(
      { err: error, para: correo.para, asunto },
      'fallo al enviar el correo; la operación se da por buena igualmente',
    );
  }
}

// ── invitación ───────────────────────────────────────────────────────────────

export interface DatosInvitacion {
  para: string;
  nombreQuienInvita: string;
  nombreTenant: string;
  enlace: string;
}

export async function enviarInvitacion(
  datos: DatosInvitacion,
  log?: RegistroLog,
): Promise<void> {
  const quien = escaparHtml(datos.nombreQuienInvita);
  const tenant = escaparHtml(datos.nombreTenant);

  const asunto = `${datos.nombreQuienInvita} te invitó a ${datos.nombreTenant}`;

  const html = maquetar({
    titulo: `Te invitaron a ${datos.nombreTenant}`,
    parrafos: [
      `<strong>${quien}</strong> te invitó a trabajar en <strong>${tenant}</strong>.`,
      'Para entrar solo tenés que crear tu contraseña desde el enlace de abajo.',
    ],
    textoBoton: 'Aceptar la invitación',
    enlace: datos.enlace,
    caducidad: `El enlace caduca en ${duracionLegible(config.INVITATION_TTL_SECONDS)}. Pasado ese plazo hay que pedir otra invitación.`,
    cierre: 'Si no esperabas esta invitación, podés ignorar este correo.',
  });

  const texto = [
    `${datos.nombreQuienInvita} te invitó a trabajar en ${datos.nombreTenant}.`,
    '',
    'Para entrar, creá tu contraseña desde esta dirección:',
    datos.enlace,
    '',
    `El enlace caduca en ${duracionLegible(config.INVITATION_TTL_SECONDS)}. Pasado ese plazo hay que pedir otra invitación.`,
    'Si no esperabas esta invitación, podés ignorar este correo.',
    '',
    `${config.EMAIL_FROM_NAME} · Este correo es automático, no hace falta responderlo.`,
  ].join('\n');

  await enviar({ para: datos.para, asunto, html, texto }, log);
}

// ── recuperación de contraseña ───────────────────────────────────────────────

export interface DatosResetPassword {
  para: string;
  enlace: string;
}

export async function enviarResetPassword(
  datos: DatosResetPassword,
  log?: RegistroLog,
): Promise<void> {
  const asunto = 'Recuperá tu contraseña';

  const html = maquetar({
    titulo: 'Recuperá tu contraseña',
    parrafos: [
      'Pediste recuperar la contraseña de tu cuenta. El enlace de abajo te lleva a elegir una nueva.',
    ],
    textoBoton: 'Elegir contraseña nueva',
    enlace: datos.enlace,
    caducidad: `El enlace caduca en ${duracionLegible(config.PASSWORD_RESET_TTL_SECONDS)} y sirve una sola vez.`,
    // Se dice explícitamente que no hace falta hacer nada: quien recibe esto sin
    // haberlo pedido tiene que saber que su contraseña sigue intacta.
    cierre:
      'Si no fuiste vos, ignorá este correo: tu contraseña no cambia hasta que alguien abra el enlace.',
  });

  const texto = [
    'Pediste recuperar la contraseña de tu cuenta.',
    '',
    'Elegí una nueva desde esta dirección:',
    datos.enlace,
    '',
    `El enlace caduca en ${duracionLegible(config.PASSWORD_RESET_TTL_SECONDS)} y sirve una sola vez.`,
    'Si no fuiste vos, ignorá este correo: tu contraseña no cambia hasta que alguien abra el enlace.',
    '',
    `${config.EMAIL_FROM_NAME} · Este correo es automático, no hace falta responderlo.`,
  ].join('\n');

  await enviar({ para: datos.para, asunto, html, texto }, log);
}
