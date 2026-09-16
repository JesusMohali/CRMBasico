/**
 * Capa HTTP contra la API del CRM.
 *
 * La SPA y la API se sirven desde el MISMO origen (el ALB manda /api/* a la API
 * y el resto al nginx que sirve esta app), así que las rutas van relativas y no
 * hay CORS que negociar. `VITE_API_BASE` existe solo para escenarios raros —
 * apuntar a otro host en una prueba — y por defecto está vacío.
 *
 * Este módulo NO importa el store de sesión a propósito: el store sí importa
 * esto, y un import en los dos sentidos sería un ciclo. En su lugar el store se
 * "enchufa" con `conectarSesion()` y deja aquí las tres funciones que la capa
 * HTTP necesita.
 */

const BASE = import.meta.env.VITE_API_BASE ?? '';

/** Un campo concreto rechazado por la validación del backend (Zod). */
export interface CampoInvalido {
	campo: string;
	problema: string;
}

/**
 * Error con respuesta del servidor. El backend contesta siempre
 * `{ error, mensaje }`, y en los 400 de validación añade `campos`.
 */
export class ErrorApi extends Error {
	constructor(
		readonly estado: number,
		readonly codigo: string,
		mensaje: string,
		readonly campos?: CampoInvalido[],
	) {
		super(mensaje);
		this.name = 'ErrorApi';
	}
}

/**
 * No hubo respuesta: se cayó la red, el servidor no contesta o el navegador
 * abortó la petición. Se distingue de `ErrorApi` porque el mensaje que hay que
 * enseñarle a la persona es otro ("revisá tu conexión", no "credenciales").
 */
export class ErrorDeRed extends Error {
	constructor(mensaje = 'No se pudo conectar con el servidor') {
		super(mensaje);
		this.name = 'ErrorDeRed';
	}
}

export function esErrorApi(error: unknown): error is ErrorApi {
	return error instanceof ErrorApi;
}

// ── enchufe del store de sesión ──────────────────────────────────────────────

interface PuenteDeSesion {
	/** El access token vigente, o null si no hay sesión. */
	accessToken(): string | null;
	/** Renueva la sesión. Devuelve false si ya no se puede seguir. */
	refrescar(): Promise<boolean>;
	/** La sesión murió: limpiar estado local y mandar al login. */
	alPerderSesion(): void;
}

let puente: PuenteDeSesion | null = null;

export function conectarSesion(nuevo: PuenteDeSesion) {
	puente = nuevo;
}

// ── refresco automático, con UNA sola renovación en vuelo ────────────────────

let refrescoEnVuelo: Promise<boolean> | null = null;

/**
 * CRÍTICO: el backend ROTA el refresh token en cada renovación y trata la
 * reutilización de uno ya revocado como un robo de token — cuando la detecta
 * revoca TODAS las sesiones del usuario (ver `refrescar()` en
 * BackendCRM/src/auth/service.ts).
 *
 * Si al caducar el access token varias peticiones reciben 401 a la vez y cada
 * una llamara a /auth/refresh por su cuenta, la primera rotaría el token y las
 * demás llegarían con el viejo, ya revocado: el usuario se quedaría fuera de
 * todos sus dispositivos por el simple hecho de haber cargado una pantalla con
 * tres peticiones en paralelo.
 *
 * De ahí esta función: hay como mucho una renovación en vuelo y el resto se
 * cuelga de esa misma promesa.
 */
function refrescarUnaSolaVez(): Promise<boolean> {
	if (!refrescoEnVuelo) {
		refrescoEnVuelo = (puente?.refrescar() ?? Promise.resolve(false)).finally(() => {
			refrescoEnVuelo = null;
		});
	}
	return refrescoEnVuelo;
}

// ── petición ─────────────────────────────────────────────────────────────────

export interface OpcionesPeticion {
	metodo?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
	cuerpo?: unknown;
	/** Manda el Authorization y renueva la sesión ante un 401. */
	autenticada?: boolean;
	signal?: AbortSignal;
}

/**
 * Lanza la petición y traduce la respuesta. Sin Authorization ni reintentos:
 * es la primitiva que usan tanto `peticion()` como el propio store para hablar
 * con /auth/login y /auth/refresh (que no pueden pasar por el reintento porque
 * son justamente lo que el reintento invoca).
 */
export async function peticionPublica<T>(ruta: string, opciones: OpcionesPeticion = {}): Promise<T> {
	const cabeceras: Record<string, string> = { Accept: 'application/json' };
	if (opciones.cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';

	const token = opciones.autenticada ? puente?.accessToken() : null;
	if (token) cabeceras['Authorization'] = `Bearer ${token}`;

	let respuesta: Response;
	try {
		respuesta = await fetch(`${BASE}${ruta}`, {
			method: opciones.metodo ?? (opciones.cuerpo !== undefined ? 'POST' : 'GET'),
			headers: cabeceras,
			body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
			...(opciones.signal ? { signal: opciones.signal } : {}),
		});
	} catch (error) {
		// Un abort no es un fallo de red: lo propaga tal cual para que quien
		// canceló la petición pueda distinguirlo y no enseñe un error.
		if (error instanceof DOMException && error.name === 'AbortError') throw error;
		throw new ErrorDeRed();
	}

	// 204 y compañía no traen cuerpo; intentar parsearlos daría un error inútil.
	const texto = respuesta.status === 204 ? '' : await respuesta.text();
	let datos: unknown = null;
	if (texto) {
		try {
			datos = JSON.parse(texto);
		} catch {
			datos = null;
		}
	}

	if (!respuesta.ok) {
		// Un 502/503 del ALB llega en HTML, no en el JSON de la API: ahí `datos`
		// es null y hay que inventar un mensaje en vez de leer campos que no hay.
		const cuerpo = (datos ?? {}) as { error?: string; mensaje?: string; campos?: CampoInvalido[] };
		throw new ErrorApi(
			respuesta.status,
			cuerpo.error ?? 'error_desconocido',
			cuerpo.mensaje ?? 'No se pudo completar la operación',
			cuerpo.campos,
		);
	}

	return datos as T;
}

/**
 * Petición autenticada. Ante un 401 renueva la sesión UNA vez y reintenta;
 * si la renovación falla, limpia la sesión y deja que el store mande al login.
 */
export async function peticion<T>(ruta: string, opciones: OpcionesPeticion = {}): Promise<T> {
	// Se anota con qué token sale la petición. Si al volver el 401 el token ya
	// es otro, es que otra petición renovó mientras tanto: basta con reintentar
	// con el nuevo, sin gastar una rotación de refresh token de más.
	const tokenUsado = puente?.accessToken() ?? null;

	try {
		return await peticionPublica<T>(ruta, { ...opciones, autenticada: true });
	} catch (error) {
		if (!esErrorApi(error) || error.estado !== 401) throw error;

		const tokenActual = puente?.accessToken() ?? null;
		const renovada = tokenActual !== tokenUsado ? true : await refrescarUnaSolaVez();

		if (!renovada) {
			puente?.alPerderSesion();
			throw error;
		}

		// Un único reintento: si el segundo 401 llega con un token recién
		// emitido, el problema no es la caducidad y repetir sería un bucle.
		try {
			return await peticionPublica<T>(ruta, { ...opciones, autenticada: true });
		} catch (segundo) {
			if (esErrorApi(segundo) && segundo.estado === 401) puente?.alPerderSesion();
			throw segundo;
		}
	}
}

// ── mensajes para la interfaz ────────────────────────────────────────────────

/**
 * Traduce un error a algo que se le pueda enseñar a una persona. El backend ya
 * manda mensajes en español, pero son deliberadamente vagos en los 401 (para no
 * filtrar si un email existe) y no distinguen los casos que sí importan en
 * pantalla, así que aquí se afinan por código de estado.
 */
export function mensajeDeError(error: unknown, porEstado: Record<number, string> = {}): string {
	if (error instanceof ErrorDeRed) return 'No se pudo conectar con el servidor. Revisá tu conexión.';

	if (esErrorApi(error)) {
		if (porEstado[error.estado]) return porEstado[error.estado]!;
		if (error.estado >= 500) return 'Hubo un problema en el servidor. Probá de nuevo en un momento.';
		// En los 400 de validación el detalle útil está en `campos`, no en el
		// mensaje genérico.
		if (error.campos?.length) return error.campos[0]!.problema;
		return error.message;
	}

	return 'Ocurrió un error inesperado.';
}
