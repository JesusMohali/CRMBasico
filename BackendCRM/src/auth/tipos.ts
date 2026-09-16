export type RolTenant = 'owner' | 'admin' | 'member' | 'viewer';
export type EstadoUsuario = 'invited' | 'active' | 'disabled';

// No hay tipo de rol de plataforma. auth.platform_admins sigue existiendo en la
// base, reservada para el backoffice externo, pero esta API no la consulta
// jamás: aquí no existe nadie con visibilidad por encima de un cliente.

/**
 * Jerarquía de roles de tenant. Un número mayor incluye todo lo que puede hacer
 * el menor, así que los permisos se comprueban con >= y no con una lista de
 * roles aceptados en cada endpoint (que es donde se cuelan los olvidos).
 */
export const NIVEL_ROL: Record<RolTenant, number> = {
  viewer: 1,
  member: 2,
  admin: 3,
  owner: 4,
};

export function rolAlcanza(rol: RolTenant, minimo: RolTenant): boolean {
  return NIVEL_ROL[rol] >= NIVEL_ROL[minimo];
}
