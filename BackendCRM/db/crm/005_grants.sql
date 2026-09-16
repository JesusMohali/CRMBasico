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
GRANT USAGE ON SCHEMA auth TO :"app_role";
GRANT USAGE ON SCHEMA crm  TO :"app_role";
GRANT USAGE ON SCHEMA crm  TO :"bot_role";

-- Las funciones que necesitan las políticas.
GRANT EXECUTE ON FUNCTION auth.current_tenant_id() TO :"app_role", :"bot_role";

-- ── backend ──────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO :"app_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA crm  TO :"app_role";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA auth TO :"app_role";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA crm  TO :"app_role";

-- ── bot (n8n) ────────────────────────────────────────────────────────────────
-- Sin DELETE: si un workflow se descontrola, puede escribir de más pero no
-- borrar el histórico de nadie. Y sin acceso alguno al schema auth.
GRANT SELECT, INSERT, UPDATE ON crm.leads              TO :"bot_role";
GRANT SELECT, INSERT, UPDATE ON crm.leads_renovaciones TO :"bot_role";
GRANT SELECT, INSERT, UPDATE ON crm.buffer             TO :"bot_role";
-- El buffer sí se vacía: es una cola, no un histórico.
GRANT DELETE ON crm.buffer TO :"bot_role";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA crm TO :"bot_role";

-- Necesita leer tenants para resolver a qué cliente pertenece un chat.
GRANT USAGE  ON SCHEMA auth        TO :"bot_role";
GRANT SELECT ON auth.tenants       TO :"bot_role";

-- ── por defecto para lo que se cree después ──────────────────────────────────
-- Sin esto, cada tabla nueva nace invisible para la aplicación y hay que
-- acordarse de darle permisos a mano.
ALTER DEFAULT PRIVILEGES IN SCHEMA auth
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_role";
ALTER DEFAULT PRIVILEGES IN SCHEMA crm
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_role";
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT USAGE, SELECT ON SEQUENCES TO :"app_role";
ALTER DEFAULT PRIVILEGES IN SCHEMA crm  GRANT USAGE, SELECT ON SEQUENCES TO :"app_role";
