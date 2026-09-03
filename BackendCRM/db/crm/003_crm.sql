-- 003 — Datos de negocio, ahora por tenant.
--
-- Es el esquema viejo (buffer / leads / leads_renovaciones) con tenant_id
-- obligatorio y los arreglos documentados en ../CAMBIOS-VS-ANTERIOR.md.

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
