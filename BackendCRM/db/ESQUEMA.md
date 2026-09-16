# Esquema del CRM — `crm_dev` / `crm_prod`

> Generado a partir de la introspección de la base real el 2026-09-03, no escrito a mano.
> La fuente de verdad es `crm/*.sql`; este documento la describe.

Vive en la instancia RDS compartida `gpi-pg` (PostgreSQL 17.9), una base por entorno.
Las diferencias con el esquema anterior están en [CAMBIOS-VS-ANTERIOR.md](CAMBIOS-VS-ANTERIOR.md).

## De un vistazo

| | |
|---|---|
| Schemas | `auth` (identidad) y `crm` (negocio) |
| Tablas | 11 — 8 en `auth`, 3 en `crm` |
| Columnas | 104 |
| Constraints | 53 |
| Índices | 35 |
| Tipos enum | 6 |
| Tablas con RLS | 4 |

## Por qué dos schemas

`auth` guarda identidad; `crm` guarda datos de negocio. Separarlos permite dar permisos
distintos: el bot de n8n escribe leads todo el día pero **no tiene ni `USAGE` sobre `auth`**,
así que un workflow mal escrito no puede leer un hash de contraseña ni por accidente.

## Los tres roles de base de datos

| Rol | Para qué | ¿RLS le aplica? |
|---|---|---|
| `crm_<env>` | Dueño. DDL, migraciones, semillas | **No** — es dueño de las tablas |
| `crm_<env>_app` | El backend del CRM | **Sí** |
| `crm_<env>_bot` | n8n. Solo schema `crm`, sin `DELETE` sobre leads | **Sí** |

Que el dueño se salte RLS es deliberado: es quien migra y siembra, y necesita ver todo. Por eso
**la aplicación nunca debe conectarse como `crm_<env>`** — si lo hiciera, el aislamiento no
existiría. Las contraseñas están en SSM: `/gpi/<env>/crm/db_password`, `app_password`, `bot_password`.

## Un usuario, un cliente

**Cada cliente es completamente independiente y no hay permisos cruzados de ningún tipo.** Una
cuenta pertenece como mucho a UN tenant, y lo garantiza un índice único sobre
`auth.tenant_memberships (user_id)` (`memberships_un_tenant_por_usuario`, creado en
[`006_un_tenant_por_usuario.sql`](crm/006_un_tenant_por_usuario.sql)). Intentar dar a un
usuario una segunda membresía falla:

```
ERROR:  duplicate key value violates unique constraint "memberships_un_tenant_por_usuario"
```

Está en el motor y no en el backend por la misma razón que RLS: una promesa que depende de que
ningún endpoint se olvide de comprobarla no es una garantía, es una intención.

El modelo anterior permitía la cuenta compartida entre clientes con un rol distinto en cada uno.
Se descartó. Con ella se fue también `auth.platform_admins`: un privilegio que atraviesa clientes
es exactamente lo que este diseño elimina. **La tabla sigue existiendo pero vacía** —`006` la vacía
en cada aplicación— reservada para el backoffice externo desde el que se darán de alta clientes y
sus usuarios admin. La API de autenticación no la consulta.

El alta de clientes y de sus admins **no la hace esta aplicación**: es trabajo de ese backoffice
externo, que se construirá aparte.

## Aislamiento por tenant (RLS)

Las tres tablas de negocio llevan Row Level Security con la misma política:

```sql
tenant_id = auth.current_tenant_id()
```

donde `auth.current_tenant_id()` lee el parámetro de sesión `app.tenant_id`. **Si nadie lo fija
devuelve NULL**, la comparación da NULL en vez de TRUE y no se ve ninguna fila. Falla cerrado: el
olvido produce cero resultados, nunca una fuga.

La aplicación lo fija al empezar cada transacción:

```sql
SELECT set_config('app.tenant_id', $1, true);
```

**`set_config` y no `SET LOCAL`**: `SET` solo acepta literales, no parámetros, así que obligaría a
concatenar el uuid dentro de la cadena SQL — justo donde aparecen las inyecciones. El tercer
argumento `true` equivale a `LOCAL` y hace que el valor muera con la transacción, imprescindible
con pool de conexiones: un valor no-local se queda pegado a la conexión y la siguiente petición,
que puede ser de otro cliente, lo hereda.

### `auth.audit_log`: escritura y lectura por separado

Es el único caso con dos políticas distintas, y la diferencia importa:

- **Escribir: siempre permitido.** El log registra eventos que ocurren *antes* de que exista
  contexto de tenant — un login, un intento fallido, un reset de contraseña. Con una política de
  escritura por tenant, esas entradas (`tenant_id` NULL) se rechazan y **el login entero falla**.
  Pasó exactamente eso: la primera versión llevaba una política `FOR ALL` y el backend no podía ni
  autenticar.
- **Leer: solo lo del tenant activo.** Un cliente ve su propia actividad, nunca las entradas de
  plataforma ni las de otro cliente.

No hay políticas para `UPDATE` ni `DELETE`: un registro de auditoría que la aplicación puede
modificar o borrar no sirve como registro de auditoría.

### Qué NO lleva RLS, y por qué

`auth.users`, `auth.tenants`, `auth.tenant_memberships`, `auth.sessions`, `auth.password_resets`,
`auth.platform_admins` y `auth.invitations`.

Todas son el camino de login, y **el login ocurre antes de que exista un tenant**. La primera
consulta de cualquier autenticación es `SELECT ... FROM auth.users WHERE email = $1`, sin tenant
conocido; con RLS por tenant devolvería cero filas y nadie podría entrar jamás. Igual con
`tenant_memberships`, que es justo la tabla que se lee *para averiguar* a qué cliente pertenece
quien acaba de entrar.

`auth.invitations` está en la lista por la misma razón, y también empezó protegida por error: quien
acepta una invitación **todavía no tiene sesión**, la busca por token, así que la política la dejaba
invisible y aceptar una invitación era imposible.

Su protección es por `GRANT`: solo el rol de la aplicación las toca. **El filtrado por tenant en
estas siete tablas es responsabilidad explícita del backend.**

## Verificación

`db/verify-crm-rls.sh dev` corre 11 comprobaciones contra la base real: que sin contexto no se ve
nada, que cada tenant ve solo lo suyo, que insertar una fila con el `tenant_id` de otro es
rechazado, y que el rol del bot no puede leer `auth` ni borrar leads.

El backend (`BackendCRM` en el repo del CRM) añade otras 22 de integración contra un Postgres 17
desechable, que cubren el camino completo de autenticación. Todas pasan a 2026-09-03.

---

# Tipos enum

- **`auth.membership_status`** — `invited` · `active` · `suspended`
- **`auth.platform_role`** — `superadmin` · `support` · `billing`
- **`auth.tenant_role`** — `owner` · `admin` · `member` · `viewer`
- **`auth.tenant_status`** — `trial` · `active` · `suspended` · `cancelled`
- **`auth.user_status`** — `invited` · `active` · `disabled`
- **`crm.fase_lead`** — `situacion` · `vision` · `obstaculo` · `compromiso` · `objecion` · `llamada` · `link`

Sobre `crm.fase_lead`: **el orden importa**. Al ser un enum y no texto, `ORDER BY fase` devuelve
las fases en secuencia de embudo y no en alfabético. El front las muestra con tilde y mayúscula
(`Situación`, `Visión`…); ese mapeo es cosa de la aplicación, la base guarda la forma canónica.

---

# Tablas

### `auth.audit_log`

| Columna | Tipo | Nulo | Default |
|---|---|---|---|
| `id` | bigint | **no** | — |
| `occurred_at` | timestamptz | **no** | `now()` |
| `actor_id` | uuid | sí | — |
| `tenant_id` | uuid | sí | — |
| `action` | text | **no** | — |
| `target_type` | text | sí | — |
| `target_id` | text | sí | — |
| `metadata` | jsonb | **no** | `'{}'::jsonb` |
| `ip` | inet | sí | — |

**Claves foráneas**

- `FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL`
- `FOREIGN KEY (tenant_id) REFERENCES auth.tenants(id) ON DELETE SET NULL`

**Claves**

- `audit_log_pkey` — `PRIMARY KEY (id)`

**Reglas de integridad**

- `audit_action_no_vacio` — `CHECK ((length(btrim(action)) > 0))`

**Índices**

- `audit_actor_fecha_idx` — `auth.audit_log USING btree (actor_id, occurred_at DESC)`
- `audit_tenant_fecha_idx` — `auth.audit_log USING btree (tenant_id, occurred_at DESC)`

**RLS**

- `audit_escritura` sobre `INSERT` — siempre permitido
- `audit_lectura` sobre `SELECT` — `(tenant_id = auth.current_tenant_id())`

### `auth.invitations`

| Columna | Tipo | Nulo | Default |
|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` |
| `tenant_id` | uuid | **no** | — |
| `email` | public.citext | **no** | — |
| `role` | auth.tenant_role | **no** | `'member'::auth.tenant_role` |
| `token_hash` | bytea | **no** | — |
| `invited_by` | uuid | sí | — |
| `expires_at` | timestamptz | **no** | — |
| `accepted_at` | timestamptz | sí | — |
| `accepted_by` | uuid | sí | — |
| `created_at` | timestamptz | **no** | `now()` |

**Claves foráneas**

- `FOREIGN KEY (accepted_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- `FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- `FOREIGN KEY (tenant_id) REFERENCES auth.tenants(id) ON DELETE CASCADE`

**Claves**

- `invitations_pkey` — `PRIMARY KEY (id)`
- `invitations_token_hash_key` — `UNIQUE (token_hash)`

**Reglas de integridad**

- `invitations_aceptada_coherente` — `CHECK ((((accepted_at IS NULL) AND (accepted_by IS NULL)) OR ((accepted_at IS NOT NULL) AND (accepted_by IS NOT NULL))))`
- `invitations_email_formato` — `CHECK ((email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'::citext))`

**Índices**

- `invitations_pendiente_unica` — `auth.invitations USING btree (tenant_id, email) WHERE (accepted_at IS NULL)`

### `auth.password_resets`

| Columna | Tipo | Nulo | Default |
|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` |
| `user_id` | uuid | **no** | — |
| `token_hash` | bytea | **no** | — |
| `expires_at` | timestamptz | **no** | — |
| `used_at` | timestamptz | sí | — |
| `requested_ip` | inet | sí | — |
| `created_at` | timestamptz | **no** | `now()` |

**Claves foráneas**

- `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`

**Claves**

- `password_resets_pkey` — `PRIMARY KEY (id)`
- `password_resets_token_hash_key` — `UNIQUE (token_hash)`

**Índices**

- `password_resets_user_idx` — `auth.password_resets USING btree (user_id)`

### `auth.platform_admins`

> **EN DESUSO y vacía.** La API de autenticación no la consulta y `006_un_tenant_por_usuario.sql`
> la vacía en cada aplicación. No se borra porque queda reservada para el backoffice externo de
> alta de clientes, único que volverá a escribir aquí. Un privilegio que atraviesa clientes es
> justo lo que el modelo actual descarta.

| Columna | Tipo | Nulo | Default |
|---|---|---|---|
| `user_id` | uuid | **no** | — |
| `role` | auth.platform_role | **no** | — |
| `granted_by` | uuid | sí | — |
| `granted_at` | timestamptz | **no** | `now()` |
| `notes` | text | sí | — |

**Claves foráneas**

- `FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`

**Claves**

- `platform_admins_pkey` — `PRIMARY KEY (user_id)`

### `auth.sessions`

| Columna | Tipo | Nulo | Default |
|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` |
| `user_id` | uuid | **no** | — |
| `tenant_id` | uuid | sí | — |
| `token_hash` | bytea | **no** | — |
| `issued_at` | timestamptz | **no** | `now()` |
| `expires_at` | timestamptz | **no** | — |
| `revoked_at` | timestamptz | sí | — |
| `last_used_at` | timestamptz | sí | — |
| `ip` | inet | sí | — |
| `user_agent` | text | sí | — |

**Claves foráneas**

- `FOREIGN KEY (tenant_id) REFERENCES auth.tenants(id) ON DELETE CASCADE`
- `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`

**Claves**

- `sessions_pkey` — `PRIMARY KEY (id)`
- `sessions_token_hash_key` — `UNIQUE (token_hash)`

**Reglas de integridad**

- `sessions_expira_despues` — `CHECK ((expires_at > issued_at))`

**Índices**

- `sessions_user_idx` — `auth.sessions USING btree (user_id)`
- `sessions_vivas_idx` — `auth.sessions USING btree (expires_at) WHERE (revoked_at IS NULL)`

### `auth.tenant_memberships`

| Columna | Tipo | Nulo | Default |
|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` |
| `tenant_id` | uuid | **no** | — |
| `user_id` | uuid | **no** | — |
| `role` | auth.tenant_role | **no** | `'member'::auth.tenant_role` |
| `status` | auth.membership_status | **no** | `'active'::auth.membership_status` |
| `invited_by` | uuid | sí | — |
| `created_at` | timestamptz | **no** | `now()` |
| `updated_at` | timestamptz | **no** | `now()` |

**Claves foráneas**

- `FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL`
- `FOREIGN KEY (tenant_id) REFERENCES auth.tenants(id) ON DELETE CASCADE`
- `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`

**Claves**

- `memberships_unica` — `UNIQUE (tenant_id, user_id)`
- `tenant_memberships_pkey` — `PRIMARY KEY (id)`

**Índices**

- `memberships_tenant_idx` — `auth.tenant_memberships USING btree (tenant_id, role)`
- `memberships_un_solo_owner` — `auth.tenant_memberships USING btree (tenant_id) WHERE (role = 'owner'::auth.tenant_role)`
- `memberships_un_tenant_por_usuario` — **UNIQUE** `auth.tenant_memberships USING btree (user_id)`

`memberships_un_tenant_por_usuario` es la garantía de que un usuario no pertenece a dos clientes.
Sustituye al btree no único `memberships_user_idx`, que iba sobre esa misma columna: resuelve las
mismas búsquedas (`WHERE user_id = $1`, la del login) y además impide la fila que sobra.

### `auth.tenants`

| Columna | Tipo | Nulo | Default |
|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` |
| `slug` | public.citext | **no** | — |
| `name` | text | **no** | — |
| `status` | auth.tenant_status | **no** | `'trial'::auth.tenant_status` |
| `settings` | jsonb | **no** | `'{}'::jsonb` |
| `created_at` | timestamptz | **no** | `now()` |
| `updated_at` | timestamptz | **no** | `now()` |

**Claves**

- `tenants_pkey` — `PRIMARY KEY (id)`
- `tenants_slug_key` — `UNIQUE (slug)`

**Reglas de integridad**

- `tenants_name_no_vacio` — `CHECK ((length(btrim(name)) > 0))`
- `tenants_slug_format` — `CHECK ((slug ~ '^[a-z0-9]([a-z0-9-]{0,60}[a-z0-9])?$'::citext))`

### `auth.users`

| Columna | Tipo | Nulo | Default |
|---|---|---|---|
| `id` | uuid | **no** | `gen_random_uuid()` |
| `email` | public.citext | **no** | — |
| `password_hash` | text | sí | — |
| `full_name` | text | **no** | — |
| `status` | auth.user_status | **no** | `'invited'::auth.user_status` |
| `email_verified_at` | timestamptz | sí | — |
| `last_login_at` | timestamptz | sí | — |
| `failed_login_attempts` | smallint | **no** | `0` |
| `locked_until` | timestamptz | sí | — |
| `created_at` | timestamptz | **no** | `now()` |
| `updated_at` | timestamptz | **no** | `now()` |

**Claves**

- `users_email_key` — `UNIQUE (email)`
- `users_pkey` — `PRIMARY KEY (id)`

**Reglas de integridad**

- `users_activo_con_password` — `CHECK (((status <> 'active'::auth.user_status) OR (password_hash IS NOT NULL)))`
- `users_email_formato` — `CHECK ((email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'::citext))`
- `users_intentos_no_negativos` — `CHECK ((failed_login_attempts >= 0))`
- `users_nombre_no_vacio` — `CHECK ((length(btrim(full_name)) > 0))`

**Índices**

- `users_status_idx` — `auth.users USING btree (status)`

### `crm.buffer`

| Columna | Tipo | Nulo | Default |
|---|---|---|---|
| `id` | bigint | **no** | — |
| `tenant_id` | uuid | **no** | — |
| `chat_id` | bigint | **no** | — |
| `mensaje` | text | **no** | — |
| `created_at` | timestamptz | **no** | `now()` |

**Claves foráneas**

- `FOREIGN KEY (tenant_id) REFERENCES auth.tenants(id) ON DELETE CASCADE`

**Claves**

- `buffer_pkey` — `PRIMARY KEY (id)`

**Índices**

- `buffer_tenant_chat_idx` — `crm.buffer USING btree (tenant_id, chat_id, created_at)`

**RLS**

- `buffer_aislamiento` sobre `ALL` — `(tenant_id = auth.current_tenant_id())`

### `crm.leads`

| Columna | Tipo | Nulo | Default |
|---|---|---|---|
| `id` | bigint | **no** | — |
| `tenant_id` | uuid | **no** | — |
| `chat_id` | bigint | **no** | — |
| `name` | text | sí | — |
| `username` | text | sí | — |
| `fase` | crm.fase_lead | **no** | `'situacion'::crm.fase_lead` |
| `cliente` | boolean | **no** | `false` |
| `cerrado` | boolean | **no** | `false` |
| `requires_human_review` | boolean | **no** | `false` |
| `giro_tecnico_aplicado` | boolean | **no** | `false` |
| `turnos_fase_actual` | integer | **no** | `0` |
| `fu` | smallint | **no** | `0` |
| `conversation` | text | **no** | `''::text` |
| `contexto` | jsonb | **no** | `'{}'::jsonb` |
| `progreso` | jsonb | **no** | `'{}'::jsonb` |
| `estado_conversacion` | jsonb | **no** | `'{"paso_actual": null, "ultimo_objetivo": null, "histor...` |
| `audios_enviados` | jsonb | **no** | `'[]'::jsonb` |
| `created_at` | timestamptz | **no** | `now()` |
| `updated_at` | timestamptz | **no** | `now()` |

**Claves foráneas**

- `FOREIGN KEY (tenant_id) REFERENCES auth.tenants(id) ON DELETE CASCADE`

**Claves**

- `leads_pkey` — `PRIMARY KEY (id)`
- `leads_tenant_chat_unico` — `UNIQUE (tenant_id, chat_id)`

**Reglas de integridad**

- `leads_audios_es_array` — `CHECK ((jsonb_typeof(audios_enviados) = 'array'::text))`
- `leads_contexto_es_objeto` — `CHECK ((jsonb_typeof(contexto) = 'object'::text))`
- `leads_estado_es_objeto` — `CHECK ((jsonb_typeof(estado_conversacion) = 'object'::text))`
- `leads_fu_no_negativo` — `CHECK ((fu >= 0))`
- `leads_progreso_es_objeto` — `CHECK ((jsonb_typeof(progreso) = 'object'::text))`
- `leads_turnos_no_negativos` — `CHECK ((turnos_fase_actual >= 0))`

**Índices**

- `leads_revision_humana_idx` — `crm.leads USING btree (tenant_id, updated_at DESC) WHERE requires_human_review`
- `leads_tenant_fase_idx` — `crm.leads USING btree (tenant_id, fase)`
- `leads_tenant_updated_idx` — `crm.leads USING btree (tenant_id, updated_at DESC)`

**RLS**

- `leads_aislamiento` sobre `ALL` — `(tenant_id = auth.current_tenant_id())`

### `crm.leads_renovaciones`

| Columna | Tipo | Nulo | Default |
|---|---|---|---|
| `id` | bigint | **no** | — |
| `tenant_id` | uuid | **no** | — |
| `chat_id` | bigint | **no** | — |
| `nombre` | text | sí | — |
| `username` | text | sí | — |
| `conversation` | text | **no** | `''::text` |
| `fase` | text | **no** | `'inicio'::text` |
| `satisfaccion` | text | sí | — |
| `producto_interes` | text | sí | — |
| `link_enviado` | boolean | **no** | `false` |
| `fecha_link_enviado` | timestamptz | sí | — |
| `created_at` | timestamptz | **no** | `now()` |
| `updated_at` | timestamptz | **no** | `now()` |

**Claves foráneas**

- `FOREIGN KEY (tenant_id) REFERENCES auth.tenants(id) ON DELETE CASCADE`

**Claves**

- `leads_renovaciones_pkey` — `PRIMARY KEY (id)`
- `renovaciones_tenant_chat_unico` — `UNIQUE (tenant_id, chat_id)`

**Reglas de integridad**

- `renovaciones_fase_no_vacia` — `CHECK ((length(btrim(fase)) > 0))`
- `renovaciones_link_coherente` — `CHECK ((link_enviado = (fecha_link_enviado IS NOT NULL)))`

**Índices**

- `renovaciones_tenant_fase_idx` — `crm.leads_renovaciones USING btree (tenant_id, fase)`
- `renovaciones_tenant_updated_idx` — `crm.leads_renovaciones USING btree (tenant_id, updated_at DESC)`

**RLS**

- `renovaciones_aislamiento` sobre `ALL` — `(tenant_id = auth.current_tenant_id())`
