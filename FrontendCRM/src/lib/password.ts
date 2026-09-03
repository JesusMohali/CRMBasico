/**
 * Reglas de contraseña, copiadas del backend a propósito.
 *
 * La fuente de verdad es BackendCRM/src/auth/schemas.ts, que exige 12
 * caracteres como mínimo y 200 como máximo y NO pide mayúsculas ni símbolos
 * (largo por encima de composición, como recomienda el NIST). Validar también
 * aquí no sustituye a esa comprobación: sirve para no gastar un viaje al
 * servidor y para poder decir qué falla mientras se escribe.
 */
export const LARGO_MINIMO_PASSWORD = 12;
export const LARGO_MAXIMO_PASSWORD = 200;

/** Devuelve el problema a mostrar, o null si la contraseña sirve. */
export function validarPassword(nueva: string, confirmacion: string): string | null {
	if (nueva.length < LARGO_MINIMO_PASSWORD) {
		return `La contraseña tiene que tener al menos ${LARGO_MINIMO_PASSWORD} caracteres.`;
	}
	if (nueva.length > LARGO_MAXIMO_PASSWORD) {
		return `La contraseña no puede pasar de ${LARGO_MAXIMO_PASSWORD} caracteres.`;
	}
	if (nueva !== confirmacion) {
		return 'Las dos contraseñas no coinciden.';
	}
	return null;
}
