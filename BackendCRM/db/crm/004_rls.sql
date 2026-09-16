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
