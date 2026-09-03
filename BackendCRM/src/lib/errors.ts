/**
 * Errores de la API. El mensaje que sale al cliente y el que se registra en el
 * log son deliberadamente distintos: el primero no debe filtrar si un email
 * existe, si la contraseña era casi correcta ni por qué falló exactamente.
 */
export class ErrorApi extends Error {
  constructor(
    readonly estado: number,
    readonly codigo: string,
    mensajePublico: string,
    readonly detalleInterno?: string,
  ) {
    super(mensajePublico);
    this.name = 'ErrorApi';
  }
}

export const noAutorizado = (detalle?: string) =>
  new ErrorApi(401, 'no_autorizado', 'Credenciales inválidas', detalle);

export const prohibido = (detalle?: string) =>
  new ErrorApi(403, 'prohibido', 'No tenés permiso para hacer esto', detalle);

export const noEncontrado = (detalle?: string) =>
  new ErrorApi(404, 'no_encontrado', 'No encontrado', detalle);

export const conflicto = (mensaje: string, detalle?: string) =>
  new ErrorApi(409, 'conflicto', mensaje, detalle);

export const peticionInvalida = (mensaje: string, detalle?: string) =>
  new ErrorApi(400, 'peticion_invalida', mensaje, detalle);

export const demasiadosIntentos = (mensaje: string) =>
  new ErrorApi(429, 'demasiados_intentos', mensaje);
