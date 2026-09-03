/// <reference types="vite/client" />

interface ImportMetaEnv {
	/**
	 * Prefijo de la API. Normalmente vacío: la API vive en el mismo origen que
	 * la SPA (el ALB reparte por ruta) y las peticiones van relativas. Solo se
	 * rellena para apuntar a otro host en una prueba puntual.
	 */
	readonly VITE_API_BASE?: string
}

interface ImportMeta {
	readonly env: ImportMetaEnv
}
