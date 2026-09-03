export type RolTenant = 'owner' | 'admin' | 'member' | 'viewer';
export type RolPlataforma = 'superadmin' | 'support' | 'billing';
export type EstadoUsuario = 'invited' | 'active' | 'disabled';

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

export function rolAlcanza(rol: RolTenant | null, minimo: RolTenant): boolean {
  if (!rol) return false;
  return NIVEL_ROL[rol] >= NIVEL_ROL[minimo];
}
