-- 002 — Identidad y multitenancy.
--
-- Modelo: UNA sola tabla de usuarios para clientes y para staff de GPI. Dos
-- tablas de usuarios significarían dos flujos de login, dos lógicas de hash y
-- dos sitios donde olvidarse de bloquear una cuenta comprometida.
--
-- La pertenencia a un cliente vive en tenant_memberships. OJO: desde
-- 006_un_tenant_por_usuario.sql un usuario pertenece como mucho a UN tenant y
-- platform_admins queda en desuso; los clientes son estancos y no hay permisos
-- cruzados. Lo que sigue es el esquema base, 006 es quien manda.

-- ── Tipos ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE auth.tenant_status AS ENUM ('trial', 'active', 'suspended', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE auth.user_status AS ENUM ('invited', 'active', 'disabled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- owner  : responsable del cliente. Uno solo por tenant (ver índice parcial abajo).
-- admin  : gestiona usuarios y configuración. Puede haber varios.
-- member : opera el día a día (leads, chats).
-- viewer : solo lectura.
DO $$ BEGIN
  CREATE TYPE auth.tenant_role AS ENUM ('owner', 'admin', 'member', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- superadmin : todo, incluido conceder privilegio de plataforma.
-- support    : entra a datos de clientes para dar soporte. Queda en audit_log.
-- billing    : facturación y planes, sin acceso a conversaciones.
DO $$ BEGIN
  CREATE TYPE auth.platform_role AS ENUM ('superadmin', 'support', 'billing');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE auth.membership_status AS ENUM ('invited', 'active', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── tenants ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth.tenants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       citext NOT NULL UNIQUE,
  name       text   NOT NULL,
  status     auth.tenant_status NOT NULL DEFAULT 'trial',
  settings   jsonb  NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- El slug va en subdominios y URLs: minúsculas, dígitos y guiones, sin
  -- empezar ni terminar en guión.
  CONSTRAINT tenants_slug_format CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{0,60}[a-z0-9])?$'),
  CONSTRAINT tenants_name_no_vacio CHECK (length(btrim(name)) > 0)
);

COMMENT ON TABLE  auth.tenants IS 'Clientes de GPI. Un tenant = una empresa con su propio bot, sus leads y sus usuarios.';
COMMENT ON COLUMN auth.tenants.slug IS 'Identificador legible para subdominios y URLs. citext: no se distinguen mayúsculas.';
COMMENT ON COLUMN auth.tenants.settings IS 'Configuración libre por cliente. Aquí es donde irá la personalización de prompts cuando se aborde (prompt base + contexto del cliente).';

-- ── users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth.users (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 citext NOT NULL UNIQUE,
  password_hash         text,
  full_name             text   NOT NULL,
  status                auth.user_status NOT NULL DEFAULT 'invited',
  email_verified_at     timestamptz,
  last_login_at         timestamptz,
  failed_login_attempts smallint NOT NULL DEFAULT 0,
  locked_until          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT users_email_formato CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  CONSTRAINT users_nombre_no_vacio CHECK (length(btrim(full_name)) > 0),
  -- Un usuario invitado todavía no tiene contraseña; uno activo no puede no tenerla.
  CONSTRAINT users_activo_con_password CHECK (status <> 'active' OR password_hash IS NOT NULL),
  CONSTRAINT users_intentos_no_negativos CHECK (failed_login_attempts >= 0)
);

COMMENT ON TABLE  auth.users IS 'Identidad única. Cada cuenta pertenece como mucho a UN cliente (ver tenant_memberships); no existe ningún privilegio que atraviese clientes.';
COMMENT ON COLUMN auth.users.password_hash IS 'Argon2id calculado EN LA APLICACIÓN. La contraseña en claro nunca viaja al servidor de base ni aparece en pg_stat_statements.';
COMMENT ON COLUMN auth.users.locked_until IS 'Bloqueo temporal por fuerza bruta. La aplicación lo fija tras N fallos; no hay trigger que lo haga solo.';

CREATE INDEX IF NOT EXISTS users_status_idx ON auth.users (status);

-- ── tenant_memberships ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth.tenant_memberships (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES auth.tenants(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  role       auth.tenant_role       NOT NULL DEFAULT 'member',
  status     auth.membership_status NOT NULL DEFAULT 'active',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT memberships_unica UNIQUE (tenant_id, user_id)
);

COMMENT ON TABLE auth.tenant_memberships IS 'Qué usuario pertenece a qué cliente y con qué rol. UNA membresía como máximo por usuario (ver 006_un_tenant_por_usuario.sql).';

-- La búsqueda por user_id (la del login) la cubre el índice ÚNICO que crea
-- 006_un_tenant_por_usuario.sql sobre esa misma columna. Aquí no se crea un
-- btree normal para no tener dos índices sobre lo mismo.
CREATE INDEX IF NOT EXISTS memberships_tenant_idx ON auth.tenant_memberships (tenant_id, role);

-- Un solo owner por tenant: es el responsable de facturación y el destinatario
-- de "esta cuenta se cierra". Para iguales está el rol admin, que sí admite varios.
CREATE UNIQUE INDEX IF NOT EXISTS memberships_un_solo_owner
  ON auth.tenant_memberships (tenant_id)
  WHERE role = 'owner';

-- ── platform_admins ──────────────────────────────────────────────────────────
-- EN DESUSO desde 006_un_tenant_por_usuario.sql, que la vacía: un privilegio
-- que atraviesa clientes es justo lo que el modelo actual descarta. No se borra
-- la tabla porque queda reservada para el backoffice externo de alta de
-- clientes. La API de autenticación no la consulta.
CREATE TABLE IF NOT EXISTS auth.platform_admins (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       auth.platform_role NOT NULL,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  notes      text
);

COMMENT ON TABLE auth.platform_admins IS 'EN DESUSO, debe quedar vacía. Reservada para el backoffice externo. Ver 006_un_tenant_por_usuario.sql.';

-- ── sessions ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth.sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  tenant_id    uuid REFERENCES auth.tenants(id) ON DELETE CASCADE,
  token_hash   bytea NOT NULL UNIQUE,
  issued_at    timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  last_used_at timestamptz,
  ip           inet,
  user_agent   text,

  CONSTRAINT sessions_expira_despues CHECK (expires_at > issued_at)
);

COMMENT ON TABLE  auth.sessions IS 'Refresh tokens. Los access token son JWT y no se guardan.';
COMMENT ON COLUMN auth.sessions.token_hash IS 'SHA-256 del token, NUNCA el token. Con un volcado de esta tabla no se puede suplantar a nadie.';
COMMENT ON COLUMN auth.sessions.tenant_id IS 'Tenant al que está scopeada la sesión. Con una membresía por usuario, sale siempre de la única que tiene; NULL solo para una cuenta sin cliente asignado todavía.';

CREATE INDEX IF NOT EXISTS sessions_user_idx ON auth.sessions (user_id);
-- Para el barrido periódico de sesiones caducadas.
CREATE INDEX IF NOT EXISTS sessions_vivas_idx ON auth.sessions (expires_at) WHERE revoked_at IS NULL;

-- ── invitations ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth.invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES auth.tenants(id) ON DELETE CASCADE,
  email       citext NOT NULL,
  role        auth.tenant_role NOT NULL DEFAULT 'member',
  token_hash  bytea NOT NULL UNIQUE,
  invited_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at  timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT invitations_email_formato CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  CONSTRAINT invitations_aceptada_coherente CHECK (
    (accepted_at IS NULL AND accepted_by IS NULL) OR
    (accepted_at IS NOT NULL AND accepted_by IS NOT NULL)
  )
);

COMMENT ON TABLE auth.invitations IS 'Invitaciones pendientes a un tenant. Igual que sessions, guarda el hash del token y no el token.';

-- Una invitación viva por email y tenant. Las ya aceptadas no estorban.
CREATE UNIQUE INDEX IF NOT EXISTS invitations_pendiente_unica
  ON auth.invitations (tenant_id, email)
  WHERE accepted_at IS NULL;

-- ── password_resets ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth.password_resets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash   bytea NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  used_at      timestamptz,
  requested_ip inet,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE auth.password_resets IS 'Tokens de recuperación de contraseña. De un solo uso: used_at los invalida.';

CREATE INDEX IF NOT EXISTS password_resets_user_idx ON auth.password_resets (user_id);

-- ── audit_log ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth.audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id    uuid REFERENCES auth.users(id)   ON DELETE SET NULL,
  tenant_id   uuid REFERENCES auth.tenants(id) ON DELETE SET NULL,
  action      text NOT NULL,
  target_type text,
  target_id   text,
  metadata    jsonb NOT NULL DEFAULT '{}',
  ip          inet,

  CONSTRAINT audit_action_no_vacio CHECK (length(btrim(action)) > 0)
);

COMMENT ON TABLE  auth.audit_log IS 'Quién hizo qué. Importa sobre todo para dejar rastro de cuando un admin de GPI entra a datos de un cliente.';
COMMENT ON COLUMN auth.audit_log.actor_id IS 'ON DELETE SET NULL a propósito: borrar un usuario no debe borrar la evidencia de lo que hizo.';

CREATE INDEX IF NOT EXISTS audit_tenant_fecha_idx ON auth.audit_log (tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_actor_fecha_idx  ON auth.audit_log (actor_id, occurred_at DESC);

-- ── triggers de updated_at ───────────────────────────────────────────────────
DROP TRIGGER IF EXISTS tenants_updated_at ON auth.tenants;
CREATE TRIGGER tenants_updated_at BEFORE UPDATE ON auth.tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS users_updated_at ON auth.users;
CREATE TRIGGER users_updated_at BEFORE UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS memberships_updated_at ON auth.tenant_memberships;
CREATE TRIGGER memberships_updated_at BEFORE UPDATE ON auth.tenant_memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
