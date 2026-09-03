-- 001 — Extensiones, schemas y utilidades comunes.
--
-- Se corre CONECTADO A crm_<env> como el rol dueño (crm_<env>). Idempotente.

-- citext: email y slug se comparan sin distinguir mayúsculas. Sin esto,
-- 'Rodrigo@x.com' y 'rodrigo@x.com' son dos cuentas distintas y el registro
-- duplicado entra sin que ningún UNIQUE lo frene.
CREATE EXTENSION IF NOT EXISTS citext;

-- gen_random_uuid() es nativo desde PostgreSQL 13 (estamos en 17), no hace
-- falta pgcrypto.

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS crm;

COMMENT ON SCHEMA auth IS 'Identidad: tenants, usuarios, roles, sesiones. Separado de crm para poder dar permisos distintos: el bot de n8n escribe leads pero no tiene por qué ver un hash de contraseña.';
COMMENT ON SCHEMA crm IS 'Datos de negocio por tenant: leads, buffer de mensajes, renovaciones.';

-- Ningún objeto nuevo debe quedar accesible a PUBLIC por defecto.
REVOKE ALL ON SCHEMA public FROM PUBLIC;

-- updated_at automático. Se define una sola vez en public porque la usan
-- triggers de los dos schemas.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at() IS 'Trigger BEFORE UPDATE: mantiene updated_at sin depender de que la aplicación se acuerde.';

-- Tenant activo de la conexión. Es la pieza sobre la que se apoya TODO el
-- aislamiento por RLS.
--
-- Devuelve NULL si nadie fijó app.tenant_id, y como `tenant_id = NULL` es NULL
-- (no TRUE), una conexión sin contexto no ve NINGUNA fila. Falla cerrado: el
-- olvido produce cero resultados, no una fuga.
--
-- El segundo argumento `true` de current_setting evita que reviente cuando el
-- parámetro no está definido.
CREATE OR REPLACE FUNCTION auth.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

COMMENT ON FUNCTION auth.current_tenant_id() IS 'Tenant de la conexión, leído de app.tenant_id. NULL si no se fijó, lo que hace que las políticas RLS no devuelvan ninguna fila.';
