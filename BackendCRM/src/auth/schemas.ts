import { z } from 'zod';

// Longitud mínima 12 y no la típica 8. Nada de exigir mayúscula, número y
// símbolo: esas reglas empujan a la gente a "Password1!" y las guías actuales
// del NIST recomiendan largo por encima de composición.
const password = z
  .string()
  .min(12, 'La contraseña debe tener al menos 12 caracteres')
  .max(200, 'Demasiado larga');

// El tope de 254 es el máximo de un email según el RFC 5321. Sin él, un campo
// sin límite es un vector de gasto: cada intento cuesta un hash de Argon2.
const email = z.string().email('Email inválido').max(254).toLowerCase().trim();

export const esquemaLogin = z.object({
  email,
  password: z.string().min(1).max(200),
  tenant: z.string().max(62).optional(),
});

export const esquemaRefresh = z.object({
  refreshToken: z.string().min(1).max(200),
});

export const esquemaLogout = z.object({
  todas: z.boolean().default(false),
});

export const esquemaCambiarTenant = z.object({
  tenant: z.string().min(1).max(62),
});

export const esquemaCambiarPassword = z.object({
  actual: z.string().min(1).max(200),
  nueva: password,
});

export const esquemaSolicitarReset = z.object({ email });

export const esquemaConfirmarReset = z.object({
  token: z.string().min(1).max(200),
  password,
});

export const esquemaInvitar = z.object({
  email,
  rol: z.enum(['admin', 'member', 'viewer']),
});

export const esquemaAceptarInvitacion = z.object({
  token: z.string().min(1).max(200),
  nombre: z.string().min(1).max(200).trim(),
  password,
});

export const esquemaCambiarRol = z.object({
  rol: z.enum(['admin', 'member', 'viewer']),
});
