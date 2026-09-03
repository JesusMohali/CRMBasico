-- GENERADO POR test/sync-schema.sh — NO EDITAR A MANO.
-- Fuente de verdad: repo de infra, sql/crm/*.sql
-- Regenerado: 2026-09-03

-- ══════════════════════════ 001_extensions_schemas.sql ══════════════════════════
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

-- ══════════════════════════ 002_auth.sql ══════════════════════════
-- 002 — Identidad y multitenancy.
--
-- Modelo: UNA sola tabla de usuarios para clientes y para staff de GPI. Dos
-- tablas de usuarios significarían dos flujos de login, dos lógicas de hash y
-- dos sitios donde olvidarse de bloquear una cuenta comprometida.
--
-- La pertenencia a un cliente vive en tenant_memberships (un usuario puede
-- estar en varios), y el privilegio global en platform_admins.

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

COMMENT ON TABLE  auth.users IS 'Identidad única: la misma tabla para usuarios de clientes y para staff de GPI. El privilegio global se concede en platform_admins, no con un flag aquí.';
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

COMMENT ON TABLE auth.tenant_memberships IS 'Qué usuario pertenece a qué cliente y con qué rol. Un usuario puede estar en varios tenants con roles distintos.';

CREATE INDEX IF NOT EXISTS memberships_user_idx   ON auth.tenant_memberships (user_id);
CREATE INDEX IF NOT EXISTS memberships_tenant_idx ON auth.tenant_memberships (tenant_id, role);

-- Un solo owner por tenant: es el responsable de facturación y el destinatario
-- de "esta cuenta se cierra". Para iguales está el rol admin, que sí admite varios.
CREATE UNIQUE INDEX IF NOT EXISTS memberships_un_solo_owner
  ON auth.tenant_memberships (tenant_id)
  WHERE role = 'owner';

-- ── platform_admins ──────────────────────────────────────────────────────────
-- Tabla y no un booleano en users: así queda registrado QUIÉN concedió el
-- privilegio y CUÁNDO, y la lista de quien puede verlo todo son tres filas que
-- se auditan de un vistazo, en vez de un flag perdido entre miles de usuarios.
CREATE TABLE IF NOT EXISTS auth.platform_admins (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       auth.platform_role NOT NULL,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  notes      text
);

COMMENT ON TABLE auth.platform_admins IS 'Staff de GPI con privilegio sobre toda la plataforma. Pertenecer a esta tabla es independiente de tener membership en algún tenant.';

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
COMMENT ON COLUMN auth.sessions.tenant_id IS 'Tenant al que está scopeada la sesión. NULL = sesión de staff de GPI sin cliente activo.';

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

-- ══════════════════════════ 003_crm.sql ══════════════════════════
-- 003 — Datos de negocio, ahora por tenant.
--
-- Es el esquema viejo (buffer / leads / leads_renovaciones) con tenant_id
-- obligatorio y los arreglos documentados en schema/CAMBIOS-VS-ANTERIOR.md.

-- Las siete fases confirmadas. El orden del enum importa: ORDER BY fase las
-- devuelve en secuencia de embudo, no alfabéticas.
DO $$ BEGIN
  CREATE TYPE crm.fase_lead AS ENUM (
    'situacion', 'vision', 'obstaculo', 'compromiso', 'objecion', 'llamada', 'link'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TYPE crm.fase_lead IS 'Fases del embudo, en orden. El front las muestra con tilde y mayúscula (Situación, Visión...); el mapeo es cosa de la aplicación.';

-- ── leads ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm.leads (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id             uuid   NOT NULL REFERENCES auth.tenants(id) ON DELETE CASCADE,
  chat_id               bigint NOT NULL,
  name                  text,
  username              text,
  fase                  crm.fase_lead NOT NULL DEFAULT 'situacion',
  cliente               boolean NOT NULL DEFAULT false,
  cerrado               boolean NOT NULL DEFAULT false,
  requires_human_review boolean NOT NULL DEFAULT false,
  giro_tecnico_aplicado boolean NOT NULL DEFAULT false,
  turnos_fase_actual    integer  NOT NULL DEFAULT 0,
  fu                    smallint NOT NULL DEFAULT 0,
  conversation          text  NOT NULL DEFAULT '',
  contexto              jsonb NOT NULL DEFAULT '{}',
  progreso              jsonb NOT NULL DEFAULT '{}',
  estado_conversacion   jsonb NOT NULL DEFAULT
    '{"paso_actual": null, "ultimo_objetivo": null, "historial_acciones": [], "esperando_respuesta_a": null, "turnos_en_fase_actual": 0}',
  audios_enviados       jsonb NOT NULL DEFAULT '[]',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- La clave de negocio. Antes chat_id era único a secas; con varios clientes,
  -- dos bots distintos pueden ver el mismo chat_id de Telegram y no deben chocar.
  CONSTRAINT leads_tenant_chat_unico UNIQUE (tenant_id, chat_id),

  CONSTRAINT leads_turnos_no_negativos  CHECK (turnos_fase_actual >= 0),
  CONSTRAINT leads_fu_no_negativo       CHECK (fu >= 0),
  CONSTRAINT leads_contexto_es_objeto   CHECK (jsonb_typeof(contexto) = 'object'),
  CONSTRAINT leads_progreso_es_objeto   CHECK (jsonb_typeof(progreso) = 'object'),
  CONSTRAINT leads_estado_es_objeto     CHECK (jsonb_typeof(estado_conversacion) = 'object'),
  CONSTRAINT leads_audios_es_array      CHECK (jsonb_typeof(audios_enviados) = 'array')
);

COMMENT ON TABLE  crm.leads IS 'Un lead por conversación de Telegram y por cliente.';
COMMENT ON COLUMN crm.leads.chat_id IS 'Chat de Telegram. Único DENTRO del tenant, no globalmente.';
COMMENT ON COLUMN crm.leads.cliente IS 'Antes se llamaba "alumno". Renombrado para generalizar: GPI ya no sirve solo a formación.';
COMMENT ON COLUMN crm.leads.fu IS 'Contador de follow-ups enviados.';
COMMENT ON COLUMN crm.leads.conversation IS 'Transcripción acumulada. Crece sin techo — candidata a mover a su propia tabla de mensajes cuando moleste.';

CREATE INDEX IF NOT EXISTS leads_tenant_fase_idx    ON crm.leads (tenant_id, fase);
CREATE INDEX IF NOT EXISTS leads_tenant_updated_idx ON crm.leads (tenant_id, updated_at DESC);
-- Bandeja de "esto lo mira un humano": pocas filas sobre muchas, índice parcial.
CREATE INDEX IF NOT EXISTS leads_revision_humana_idx
  ON crm.leads (tenant_id, updated_at DESC)
  WHERE requires_human_review;

-- ── buffer ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm.buffer (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id  uuid   NOT NULL REFERENCES auth.tenants(id) ON DELETE CASCADE,
  chat_id    bigint NOT NULL,
  mensaje    text   NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  crm.buffer IS 'Mensajes entrantes en espera de ser procesados por el bot (la ventana de agrupación de ~10s).';
COMMENT ON COLUMN crm.buffer.chat_id IS 'SIN clave foránea a leads a propósito: un mensaje puede llegar antes de que exista la fila del lead, y una FK haría fallar la primera inserción de cada conversación nueva.';
COMMENT ON COLUMN crm.buffer.created_at IS 'timestamptz. Antes era timestamp sin zona, lo que con servidores en UTC y usuarios en UY/ES daba desfases de horas.';

CREATE INDEX IF NOT EXISTS buffer_tenant_chat_idx ON crm.buffer (tenant_id, chat_id, created_at);

-- ── leads_renovaciones ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm.leads_renovaciones (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id          uuid   NOT NULL REFERENCES auth.tenants(id) ON DELETE CASCADE,
  chat_id            bigint NOT NULL,
  nombre             text,
  username           text,
  conversation       text NOT NULL DEFAULT '',
  fase               text NOT NULL DEFAULT 'inicio',
  satisfaccion       text,
  producto_interes   text,
  link_enviado       boolean NOT NULL DEFAULT false,
  fecha_link_enviado timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT renovaciones_tenant_chat_unico UNIQUE (tenant_id, chat_id),
  CONSTRAINT renovaciones_fase_no_vacia CHECK (length(btrim(fase)) > 0),
  -- Si el link se envió tiene que haber fecha, y al revés.
  CONSTRAINT renovaciones_link_coherente CHECK (link_enviado = (fecha_link_enviado IS NOT NULL))
);

COMMENT ON TABLE  crm.leads_renovaciones IS 'Embudo de renovación, separado del de captación.';
COMMENT ON COLUMN crm.leads_renovaciones.chat_id IS 'bigint. Antes era text mientras que leads.chat_id era bigint, así que las dos tablas no se podían cruzar sin castear.';
COMMENT ON COLUMN crm.leads_renovaciones.fase IS 'PENDIENTE: sigue siendo text libre. El export del esquema viejo solo mostraba el default (inicio) y no los demás valores; convertirlo a enum inventando el dominio rompería el bot en cuanto escribiera una fase no listada. Confirmar los valores y migrarlo.';

CREATE INDEX IF NOT EXISTS renovaciones_tenant_fase_idx    ON crm.leads_renovaciones (tenant_id, fase);
CREATE INDEX IF NOT EXISTS renovaciones_tenant_updated_idx ON crm.leads_renovaciones (tenant_id, updated_at DESC);

-- ── triggers de updated_at ───────────────────────────────────────────────────
DROP TRIGGER IF EXISTS leads_updated_at ON crm.leads;
CREATE TRIGGER leads_updated_at BEFORE UPDATE ON crm.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS renovaciones_updated_at ON crm.leads_renovaciones;
CREATE TRIGGER renovaciones_updated_at BEFORE UPDATE ON crm.leads_renovaciones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ══════════════════════════ 004_rls.sql ══════════════════════════
-- 004 — Row Level Security.
--
-- QUÉ RESUELVE: que una consulta a la que se le olvidó el WHERE tenant_id no
-- pueda devolver datos de otro cliente. No es "confiamos en que el backend
-- filtre bien", es que el motor no lo deja.
--
-- CÓMO SE USA DESDE LA APLICACIÓN: al principio de cada transacción,
--
--     SELECT set_config('app.tenant_id', $1, true);
--
-- set_config y NO "SET LOCAL app.tenant_id = ...": SET solo acepta literales,
-- no expresiones ni parámetros de consulta. Con SET habría que interpolar el
-- uuid en la cadena SQL a mano, que es exactamente la clase de código donde
-- aparecen las inyecciones. set_config recibe el uuid como parámetro y no
-- requiere concatenar nada.
--
-- El tercer argumento (true) es "is_local": equivale a SET LOCAL y hace que el
-- valor muera con la transacción. Es imprescindible con pool de conexiones —
-- un valor no-local se queda pegado a la conexión y la siguiente petición, que
-- puede ser de OTRO cliente, lo hereda.
--
-- Si nadie lo fija, auth.current_tenant_id() devuelve NULL, la comparación da
-- NULL en vez de TRUE y no se ve ninguna fila. Falla cerrado.
--
-- POR QUÉ ENABLE Y NO FORCE: el dueño de una tabla se salta RLS salvo que se
-- pida FORCE. Eso es deliberado — el rol dueño (crm_<env>) corre migraciones y
-- seeds, que necesitan ver todo. La aplicación NUNCA se conecta como dueño:
-- usa crm_<env>_app, que no lo es y por tanto sí queda sujeto a las políticas.

-- ── crm.leads ────────────────────────────────────────────────────────────────
ALTER TABLE crm.leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leads_aislamiento ON crm.leads;
CREATE POLICY leads_aislamiento ON crm.leads
  USING       (tenant_id = auth.current_tenant_id())
  WITH CHECK  (tenant_id = auth.current_tenant_id());

-- ── crm.buffer ───────────────────────────────────────────────────────────────
ALTER TABLE crm.buffer ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS buffer_aislamiento ON crm.buffer;
CREATE POLICY buffer_aislamiento ON crm.buffer
  USING       (tenant_id = auth.current_tenant_id())
  WITH CHECK  (tenant_id = auth.current_tenant_id());

-- ── crm.leads_renovaciones ───────────────────────────────────────────────────
ALTER TABLE crm.leads_renovaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS renovaciones_aislamiento ON crm.leads_renovaciones;
CREATE POLICY renovaciones_aislamiento ON crm.leads_renovaciones
  USING       (tenant_id = auth.current_tenant_id())
  WITH CHECK  (tenant_id = auth.current_tenant_id());

-- ── auth.invitations: SIN RLS ────────────────────────────────────────────────
-- Al principio la protegí por tenant, y estaba mal. Quien acepta una invitación
-- todavía NO tiene sesión: la busca por token, sin tenant que fijar, así que la
-- política la dejaba invisible y aceptar una invitación era imposible.
-- Pertenece al camino pre-autenticación, igual que users y memberships.
ALTER TABLE auth.invitations DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invitations_aislamiento ON auth.invitations;

-- ── auth.audit_log ───────────────────────────────────────────────────────────
-- Escritura y lectura llevan políticas SEPARADAS, y la diferencia importa.
--
-- Escribir: siempre. El log registra eventos que ocurren ANTES de que exista
-- contexto de tenant — un login, un intento fallido, un reset de contraseña. Con
-- una política de escritura por tenant, esos eventos (tenant_id NULL) se
-- rechazan y el login entero falla. Que es exactamente lo que pasaba.
--
-- Leer: solo lo del tenant activo. Un cliente ve su propia actividad y nunca las
-- entradas de plataforma ni las de otro cliente.
ALTER TABLE auth.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_aislamiento ON auth.audit_log;
DROP POLICY IF EXISTS audit_escritura ON auth.audit_log;
DROP POLICY IF EXISTS audit_lectura ON auth.audit_log;

CREATE POLICY audit_escritura ON auth.audit_log
  FOR INSERT WITH CHECK (true);

CREATE POLICY audit_lectura ON auth.audit_log
  FOR SELECT USING (tenant_id = auth.current_tenant_id());

-- Sin políticas para UPDATE ni DELETE: un registro de auditoría que se puede
-- modificar o borrar desde la aplicación no sirve como registro de auditoría.

-- ── LO QUE NO LLEVA RLS, Y POR QUÉ ───────────────────────────────────────────
--
--   auth.users
--   auth.tenants
--   auth.tenant_memberships
--   auth.sessions
--   auth.password_resets
--   auth.platform_admins
--   auth.invitations
--
-- Son el camino de login, y el login ocurre ANTES de que exista tenant. La
-- primera consulta de cualquier autenticación es
--
--     SELECT ... FROM auth.users WHERE email = $1
--
-- sin tenant conocido todavía; con RLS por tenant devolvería cero filas y
-- nadie podría entrar nunca. Lo mismo con memberships, que es justo la tabla
-- que se lee PARA averiguar a qué tenants pertenece quien acaba de entrar.
--
-- Su protección es por GRANT (ver 005_grants.sql): solo el rol de la
-- aplicación las toca, el rol del bot de n8n no tiene ni SELECT sobre ellas.
-- El filtrado por tenant en estas seis tablas es responsabilidad explícita del
-- backend.

-- ══════════════════════════ 005_grants.sql ══════════════════════════
-- 005 — Permisos por rol.
--
-- Tres roles, tres niveles de acceso. Ninguno es el master de RDS.
--
--   crm_<env>       dueño. DDL, migraciones y seeds. Se salta RLS por ser
--                   dueño de las tablas. La aplicación NO lo usa nunca.
--   crm_<env>_app   el backend del CRM. DML sobre todo, RLS aplicada.
--   crm_<env>_bot   n8n. Solo el schema crm y solo lo que el bot escribe:
--                   ni ve auth, ni puede leer un hash de contraseña aunque
--                   alguien se equivoque en un workflow.
--
-- :app_role y :bot_role los pasa apply-crm-schema.sh con -v.

-- Conectarse y ver los schemas.
GRANT USAGE ON SCHEMA auth TO crm_test_app;
GRANT USAGE ON SCHEMA crm  TO crm_test_app;
GRANT USAGE ON SCHEMA crm  TO crm_test_bot;

-- Las funciones que necesitan las políticas.
GRANT EXECUTE ON FUNCTION auth.current_tenant_id() TO crm_test_app, crm_test_bot;

-- ── backend ──────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO crm_test_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA crm  TO crm_test_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA auth TO crm_test_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA crm  TO crm_test_app;

-- ── bot (n8n) ────────────────────────────────────────────────────────────────
-- Sin DELETE: si un workflow se descontrola, puede escribir de más pero no
-- borrar el histórico de nadie. Y sin acceso alguno al schema auth.
GRANT SELECT, INSERT, UPDATE ON crm.leads              TO crm_test_bot;
GRANT SELECT, INSERT, UPDATE ON crm.leads_renovaciones TO crm_test_bot;
GRANT SELECT, INSERT, UPDATE ON crm.buffer             TO crm_test_bot;
-- El buffer sí se vacía: es una cola, no un histórico.
GRANT DELETE ON crm.buffer TO crm_test_bot;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA crm TO crm_test_bot;

-- Necesita leer tenants para resolver a qué cliente pertenece un chat.
GRANT USAGE  ON SCHEMA auth        TO crm_test_bot;
GRANT SELECT ON auth.tenants       TO crm_test_bot;

-- ── por defecto para lo que se cree después ──────────────────────────────────
-- Sin esto, cada tabla nueva nace invisible para la aplicación y hay que
-- acordarse de darle permisos a mano.
ALTER DEFAULT PRIVILEGES IN SCHEMA auth
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crm_test_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA crm
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crm_test_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT USAGE, SELECT ON SEQUENCES TO crm_test_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA crm  GRANT USAGE, SELECT ON SEQUENCES TO crm_test_app;

