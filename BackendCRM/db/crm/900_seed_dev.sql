-- 900 — Datos sintéticos para dev. NO correr en prod.
--
-- Dos clientes con tres conversaciones cada uno, en fases distintas, y
-- **exactamente un usuario admin por cliente**. Sirve para probar el modelo y,
-- sobre todo, para verificar que RLS aísla.
--
-- QUÉ DESAPARECIÓ DE ESTA SEMILLA Y POR QUÉ: antes sembraba seis usuarios,
-- una membresía cruzada (la misma cuenta en los dos clientes con rol distinto)
-- y dos admins de plataforma. Nada de eso existe ya en el modelo: cada cliente
-- es independiente, un usuario pertenece como mucho a UN tenant (ver
-- 006_un_tenant_por_usuario.sql) y `auth.platform_admins` está en desuso. Una
-- semilla que siguiera creando esos casos estaría probando un modelo que ya no
-- es el nuestro — y el índice único de 006 la haría fallar.
--
-- El alta real de clientes y de sus usuarios admin se hará desde un backoffice
-- externo a esta aplicación. Aquí solo se simula el resultado.
--
-- Idempotente: se puede correr las veces que haga falta.
--
-- LAS CUENTAS NO PUEDEN INICIAR SESIÓN. El password_hash es un relleno con
-- formato de Argon2id pero que no corresponde a ninguna contraseña, así que
-- no hay forma de que coincida con nada. Sembrar una contraseña conocida en
-- una base alcanzable sería regalar un acceso.

\set ON_ERROR_STOP on

DO $$
DECLARE
  t_acme       uuid;
  t_planb      uuid;
  u_adm_acme   uuid;
  u_adm_planb  uuid;
  -- Relleno con forma de Argon2id que no valida contra ninguna contraseña.
  fake_hash constant text :=
    '$argon2id$v=19$m=65536,t=3,p=4$c2VtaWxsYS1kZS1kZXY$00000000000000000000000000000000';
BEGIN

  -- ── tenants ────────────────────────────────────────────────────────────────
  INSERT INTO auth.tenants (slug, name, status) VALUES
    ('acme-formacion', 'Acme Formación',   'active'),
    ('planb-trading',  'Plan B Trading',   'trial')
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
  ;

  SELECT id INTO t_acme  FROM auth.tenants WHERE slug = 'acme-formacion';
  SELECT id INTO t_planb FROM auth.tenants WHERE slug = 'planb-trading';

  -- ── usuarios: uno por cliente, y nada más ──────────────────────────────────
  -- Los emails van bajo el dominio de cada cliente, no bajo el de GPI: una
  -- cuenta de esta aplicación es siempre de un cliente concreto.
  INSERT INTO auth.users (email, full_name, status, password_hash, email_verified_at) VALUES
    ('admin@acme-formacion.test', 'Admin Acme Formación', 'active', fake_hash, now()),
    ('admin@planb-trading.test',  'Admin Plan B Trading', 'active', fake_hash, now())
  ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
  ;

  SELECT id INTO u_adm_acme  FROM auth.users WHERE email = 'admin@acme-formacion.test';
  SELECT id INTO u_adm_planb FROM auth.users WHERE email = 'admin@planb-trading.test';

  -- ── memberships: una por usuario, sin cruces ───────────────────────────────
  -- Rol `admin` y no `owner`: el responsable de facturación de un cliente es
  -- asunto del backoffice externo, no de un dato sintético de dev. `admin` es
  -- lo que tendrá el usuario que se cree al dar de alta un cliente.
  INSERT INTO auth.tenant_memberships (tenant_id, user_id, role, status) VALUES
    (t_acme,  u_adm_acme,  'admin', 'active'),
    (t_planb, u_adm_planb, 'admin', 'active')
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role
  ;

  -- Ningún INSERT en auth.platform_admins: la tabla está en desuso y debe
  -- quedar vacía (ver 006_un_tenant_por_usuario.sql).

  -- ── leads: tres por cliente, en fases distintas ────────────────────────────
  INSERT INTO crm.leads (tenant_id, chat_id, name, username, fase, cliente, turnos_fase_actual, fu, conversation) VALUES
    (t_acme,  10000001, 'Marta Ledesma',  'marta_l',   'situacion',  false, 2, 0, 'Bot: ¿Qué te trajo por acá?\nMarta: Vi el anuncio.'),
    (t_acme,  10000002, 'Pablo Quiroga',  'pquiroga',  'compromiso', false, 5, 1, 'Bot: ¿Te sirve el jueves?\nPablo: Sí, dale.'),
    (t_acme,  10000003, 'Lucía Ferrari',  'lucia_f',   'link',       true,  9, 2, 'Bot: Te dejo el link de pago.\nLucía: Perfecto.'),
    (t_planb, 20000001, 'Nicolás Bruno',  'nico_b',    'vision',     false, 3, 0, 'Bot: ¿Dónde te gustaría estar en un año?\nNicolás: Viviendo de esto.'),
    (t_planb, 20000002, 'Sofía Arenas',   'sofi_a',    'objecion',   false, 7, 3, 'Bot: ¿Qué te frena?\nSofía: El precio.'),
    (t_planb, 20000003, 'Tomás Iriarte',  'tomasi',    'llamada',    false, 6, 1, 'Bot: Te agendo la llamada.\nTomás: Ok.')
  ON CONFLICT (tenant_id, chat_id) DO UPDATE SET fase = EXCLUDED.fase
  ;

  -- Uno marcado para revisión humana, para que el índice parcial tenga qué devolver.
  UPDATE crm.leads SET requires_human_review = true
   WHERE tenant_id = t_planb AND chat_id = 20000002;

  -- ── buffer: mensajes en cola ───────────────────────────────────────────────
  DELETE FROM crm.buffer WHERE tenant_id IN (t_acme, t_planb);
  INSERT INTO crm.buffer (tenant_id, chat_id, mensaje) VALUES
    (t_acme,  10000001, 'Perdón, se me cortó'),
    (t_acme,  10000001, '¿Seguimos?'),
    (t_planb, 20000002, 'Lo pensé y quiero avanzar')
  ;

  -- ── renovaciones ───────────────────────────────────────────────────────────
  INSERT INTO crm.leads_renovaciones
    (tenant_id, chat_id, nombre, username, fase, satisfaccion, producto_interes, link_enviado, fecha_link_enviado) VALUES
    (t_acme,  10000003, 'Lucía Ferrari', 'lucia_f', 'inicio',    'alta',  'Programa avanzado', false, NULL),
    (t_planb, 20000003, 'Tomás Iriarte', 'tomasi',  'propuesta', 'media', 'Mentoría 1a1',      true,  now())
  ON CONFLICT (tenant_id, chat_id) DO UPDATE SET fase = EXCLUDED.fase
  ;

  RAISE NOTICE 'Semilla lista: 2 tenants, 2 usuarios (uno admin por tenant), 2 memberships, 0 admins de plataforma, 6 leads, 3 en buffer, 2 renovaciones.';
END $$;
