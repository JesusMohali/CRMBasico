-- 900 — Datos sintéticos para dev. NO correr en prod.
--
-- Dos clientes con tres conversaciones cada uno, en fases distintas, más
-- usuarios con los cuatro roles de tenant y dos admins de plataforma.
-- Sirve para probar el modelo y, sobre todo, para verificar que RLS aísla.
--
-- Idempotente: se puede correr las veces que haga falta.
--
-- LAS CUENTAS NO PUEDEN INICIAR SESIÓN. El password_hash es un relleno con
-- formato de Argon2id pero que no corresponde a ninguna contraseña, así que
-- no hay forma de que coincida con nada. Sembrar una contraseña conocida en
-- una base alcanzable sería regalar un acceso.


DO $$
DECLARE
  t_acme   uuid;
  t_planb  uuid;
  u_ana    uuid;
  u_bruno  uuid;
  u_carla  uuid;
  u_diego  uuid;
  u_gpi1   uuid;
  u_gpi2   uuid;
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

  -- ── usuarios ───────────────────────────────────────────────────────────────
  INSERT INTO auth.users (email, full_name, status, password_hash, email_verified_at) VALUES
    ('ana@acme-formacion.test',   'Ana Ríos',        'active', fake_hash, now()),
    ('bruno@acme-formacion.test', 'Bruno Salas',     'active', fake_hash, now()),
    ('carla@planb-trading.test',  'Carla Méndez',    'active', fake_hash, now()),
    ('diego@planb-trading.test',  'Diego Ferrer',    'invited', NULL,     NULL),
    ('rodrigo@gopeakintelligence.test', 'Rodrigo (staff GPI)', 'active', fake_hash, now()),
    ('soporte@gopeakintelligence.test', 'Soporte GPI',        'active', fake_hash, now())
  ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
  ;

  SELECT id INTO u_ana   FROM auth.users WHERE email = 'ana@acme-formacion.test';
  SELECT id INTO u_bruno FROM auth.users WHERE email = 'bruno@acme-formacion.test';
  SELECT id INTO u_carla FROM auth.users WHERE email = 'carla@planb-trading.test';
  SELECT id INTO u_diego FROM auth.users WHERE email = 'diego@planb-trading.test';
  SELECT id INTO u_gpi1  FROM auth.users WHERE email = 'rodrigo@gopeakintelligence.test';
  SELECT id INTO u_gpi2  FROM auth.users WHERE email = 'soporte@gopeakintelligence.test';

  -- ── memberships: los cuatro roles representados ────────────────────────────
  INSERT INTO auth.tenant_memberships (tenant_id, user_id, role, status) VALUES
    (t_acme,  u_ana,   'owner',  'active'),
    (t_acme,  u_bruno, 'member', 'active'),
    (t_planb, u_carla, 'owner',  'active'),
    (t_planb, u_diego, 'viewer', 'invited')
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role
  ;

  -- Ana pertenece a los DOS clientes con rol distinto en cada uno: es el caso
  -- que justifica que memberships sea una tabla aparte y no una columna en users.
  INSERT INTO auth.tenant_memberships (tenant_id, user_id, role, status) VALUES
    (t_planb, u_ana, 'admin', 'active')
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role
  ;

  -- ── admins de plataforma ───────────────────────────────────────────────────
  INSERT INTO auth.platform_admins (user_id, role, notes) VALUES
    (u_gpi1, 'superadmin', 'Semilla de dev'),
    (u_gpi2, 'support',    'Semilla de dev')
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role
  ;

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

  RAISE NOTICE 'Semilla lista: 2 tenants, 6 usuarios, 5 memberships, 2 admins de plataforma, 6 leads, 3 en buffer, 2 renovaciones.';
END $$;
