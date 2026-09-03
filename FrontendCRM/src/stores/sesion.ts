import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { conectarSesion, peticion, peticionPublica } from '../lib/api';

export type RolTenant = 'owner' | 'admin' | 'member' | 'viewer';

export interface Tenant {
	tenantId: string;
	slug: string;
	nombre: string;
	rol: RolTenant;
}

export interface Usuario {
	id: string;
	email: string;
	nombre: string;
}

/** Lo que devuelven /auth/login, /auth/refresh y /auth/invitations/accept. */
export interface Sesion {
	accessToken: string;
	refreshToken: string;
	/** Segundos de vida del access token (900 hoy). */
	expiraEn: number;
	tenant: Tenant;
	usuario: Usuario;
}

/**
 * DÓNDE VIVEN LOS TOKENS, Y QUÉ RIESGO SE ASUME
 *
 * - El ACCESS token se queda solo en memoria. Dura 900s y no sobrevive a un F5:
 *   al recargar se pide uno nuevo con el refresh token. Nunca toca el disco.
 * - El REFRESH token sí se guarda, y el sitio depende de lo que la persona
 *   marcó en "Mantener sesión iniciada":
 *     · marcado  → localStorage, sobrevive a cerrar el navegador (30 días, que
 *       es lo que dura el token en el backend).
 *     · sin marcar → sessionStorage, muere al cerrar la pestaña.
 *   Ese checkbox existía en el maquetado y no hacía absolutamente nada; esto es
 *   lo único que puede significar de forma honesta.
 *
 * RIESGO ASUMIDO: un token en storage es legible por cualquier JavaScript que
 * llegue a ejecutarse en este origen, o sea que un XSS se lo lleva. La
 * alternativa de verdad es una cookie httpOnly + SameSite emitida por la API,
 * que el JS no puede leer — pero exige cambiar el backend (emitir y leer la
 * cookie, y protegerse de CSRF) y hoy /auth/refresh recibe el token en el
 * cuerpo. Se asume el riesgo a sabiendas: la superficie se acota manteniendo el
 * access token fuera del disco y con la rotación de refresh tokens del backend,
 * que al menos hace detectable el robo.
 */
const CLAVE_REFRESH = 'pi-refresh-token';

/**
 * Todo acceso a storage va envuelto: en modo privado de algunos navegadores, o
 * con las cookies de terceros bloqueadas, leer o escribir lanza. Que falle el
 * "recordarme" es aceptable; que reviente la aplicación entera, no.
 */
function leerRefreshGuardado(): { token: string; persistente: boolean } | null {
	try {
		const enDisco = window.localStorage.getItem(CLAVE_REFRESH);
		if (enDisco) return { token: enDisco, persistente: true };
	} catch {
		/* storage no disponible */
	}
	try {
		const enPestania = window.sessionStorage.getItem(CLAVE_REFRESH);
		if (enPestania) return { token: enPestania, persistente: false };
	} catch {
		/* storage no disponible */
	}
	return null;
}

function guardarRefresh(token: string, persistente: boolean) {
	// Se limpian los dos antes de escribir: si alguien entra sin "mantener
	// sesión" después de haberla mantenido, no puede quedar el token viejo en
	// localStorage sobreviviendo al cierre del navegador.
	borrarRefreshGuardado();
	try {
		(persistente ? window.localStorage : window.sessionStorage).setItem(CLAVE_REFRESH, token);
	} catch {
		// Sin storage la sesión vive solo en memoria: funciona hasta el F5.
	}
}

function borrarRefreshGuardado() {
	try {
		window.localStorage.removeItem(CLAVE_REFRESH);
	} catch {
		/* storage no disponible */
	}
	try {
		window.sessionStorage.removeItem(CLAVE_REFRESH);
	} catch {
		/* storage no disponible */
	}
}

const ETIQUETA_ROL: Record<RolTenant, string> = {
	owner: 'Propietario',
	admin: 'Administrador',
	member: 'Miembro',
	viewer: 'Solo lectura',
};

export const useSesionStore = defineStore('sesion', () => {
	const accessToken = ref<string | null>(null);
	const refreshToken = ref<string | null>(null);
	const usuario = ref<Usuario | null>(null);
	const tenant = ref<Tenant | null>(null);
	/** true mientras `cargarSesion()` decide si hay sesión: el guard espera a esto. */
	const cargando = ref(true);
	const mantenerIniciada = ref(false);

	const autenticado = computed(() => Boolean(accessToken.value && usuario.value));
	const rol = computed<RolTenant | null>(() => tenant.value?.rol ?? null);
	const etiquetaRol = computed(() => (rol.value ? ETIQUETA_ROL[rol.value] : ''));

	/** Iniciales para el avatar del sidebar: "Ana Gómez" → "AG". */
	const iniciales = computed(() => {
		const nombre = usuario.value?.nombre?.trim();
		if (!nombre) return '?';
		const partes = nombre.split(/\s+/).slice(0, 2);
		return partes.map((parte) => parte[0]!.toUpperCase()).join('');
	});

	/**
	 * A dónde ir cuando la sesión se pierde estando dentro. Lo registra main.ts
	 * porque el router importa este store: importarlo aquí sería un ciclo.
	 */
	let salidaForzada: (() => void) | null = null;
	function registrarSalidaForzada(callback: () => void) {
		salidaForzada = callback;
	}

	function aplicar(sesion: Sesion, persistente = mantenerIniciada.value) {
		accessToken.value = sesion.accessToken;
		refreshToken.value = sesion.refreshToken;
		usuario.value = sesion.usuario;
		tenant.value = sesion.tenant;
		mantenerIniciada.value = persistente;
		guardarRefresh(sesion.refreshToken, persistente);
	}

	function limpiar() {
		accessToken.value = null;
		refreshToken.value = null;
		usuario.value = null;
		tenant.value = null;
		borrarRefreshGuardado();
	}

	// ── acciones ───────────────────────────────────────────────────────────────

	async function login(email: string, password: string, persistente: boolean) {
		// Por `peticionPublica` y no por `peticion`: el login no lleva Bearer y,
		// sobre todo, no debe entrar en el reintento con refresco — un 401 aquí
		// significa "contraseña incorrecta", no "token caducado".
		const sesion = await peticionPublica<Sesion>('/api/auth/login', {
			cuerpo: { email, password },
		});
		aplicar(sesion, persistente);
	}

	/**
	 * Renueva la sesión. Devuelve false en vez de lanzar porque quien la llama
	 * (la capa HTTP ante un 401, o el arranque) solo necesita saber si puede
	 * seguir; el motivo del fallo no cambia lo que hace después.
	 *
	 * No tiene protección propia contra llamadas simultáneas: la única que hay
	 * está en `refrescarUnaSolaVez()` de lib/api.ts, y es la que garantiza que
	 * nunca haya dos rotaciones en vuelo con el mismo token.
	 */
	async function refrescar(): Promise<boolean> {
		const token = refreshToken.value;
		if (!token) return false;

		try {
			const sesion = await peticionPublica<Sesion>('/api/auth/refresh', {
				cuerpo: { refreshToken: token },
			});
			aplicar(sesion);
			return true;
		} catch {
			// Token caducado, revocado o membresía dada de baja: en los tres
			// casos ya no hay sesión que salvar.
			limpiar();
			return false;
		}
	}

	/**
	 * Arranque: reconstruye la sesión a partir del refresh token guardado. Como
	 * el access token vive solo en memoria, después de cada F5 hay que pasar por
	 * aquí — y eso consume una rotación del refresh token, que es justo lo que
	 * el backend espera.
	 */
	async function cargarSesion() {
		const guardado = leerRefreshGuardado();
		if (guardado) {
			refreshToken.value = guardado.token;
			mantenerIniciada.value = guardado.persistente;
			await refrescar();
		}
		cargando.value = false;
	}

	async function logout() {
		try {
			// Se avisa al backend para que revoque la sesión de verdad, pero un
			// fallo de red no puede dejar a nadie encerrado dentro: pase lo que
			// pase, abajo se limpia igual.
			if (accessToken.value) await peticion('/api/auth/logout', { cuerpo: { todas: false } });
		} catch {
			/* el cierre local manda */
		} finally {
			limpiar();
		}
	}

	/** Refresca los datos del usuario contra /auth/me (rol incluido). */
	async function recargarPerfil() {
		const perfil = await peticion<{
			id: string;
			email: string;
			nombre: string;
			tenant: Tenant | null;
		}>('/api/auth/me');
		usuario.value = { id: perfil.id, email: perfil.email, nombre: perfil.nombre };
		if (perfil.tenant) tenant.value = perfil.tenant;
	}

	// La capa HTTP necesita el token y saber renovar, pero no puede importar
	// este módulo (el ciclo iría en los dos sentidos). Se le pasa aquí.
	conectarSesion({
		accessToken: () => accessToken.value,
		refrescar,
		alPerderSesion: () => {
			limpiar();
			salidaForzada?.();
		},
	});

	return {
		accessToken,
		refreshToken,
		usuario,
		tenant,
		cargando,
		mantenerIniciada,
		autenticado,
		rol,
		etiquetaRol,
		iniciales,
		aplicar,
		limpiar,
		login,
		logout,
		refrescar,
		cargarSesion,
		recargarPerfil,
		registrarSalidaForzada,
	};
});
