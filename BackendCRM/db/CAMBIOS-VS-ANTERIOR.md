# Qué cambió respecto al esquema anterior

Comparación entre `pgweb-1788354784.json` (volcado del sistema viejo) y el esquema actual.

## Antes de nada: qué contenía el volcado

`pgweb-1788354784.json` es un export de `information_schema.columns`. Trae **34 columnas de 3
tablas** con su nombre, tipo, default y nullabilidad — y nada más. No incluye claves primarias, ni
foráneas, ni índices, ni constraints, ni los valores de los tipos enum.

Eso significa que **el esquema anterior no se puede reconstruir fielmente desde ese fichero**. Lo
que sigue compara lo que sí se puede comparar, y marca lo que hubo que decidir sin evidencia.

---

## 1. El cambio de fondo: multitenancy

El esquema viejo era de un solo cliente. No existía la noción de "cliente": `leads` eran *los*
leads, sin más.

Ahora las tres tablas de negocio llevan `tenant_id uuid NOT NULL` con clave foránea a
`auth.tenants` y `ON DELETE CASCADE`, y encima **Row Level Security**, de modo que el aislamiento
no depende de que el backend se acuerde de filtrar. Detalle en [ESQUEMA.md](ESQUEMA.md).

Consecuencia directa: **la clave de negocio de un lead ya no es `chat_id` sino `(tenant_id, chat_id)`.**
Dos clientes con bots distintos pueden ver el mismo `chat_id` de Telegram y no deben colisionar.

## 2. Ocho tablas nuevas de identidad

No existía ninguna. Todas viven en el schema `auth`:

| Tabla | Para qué |
|---|---|
| `tenants` | Los clientes |
| `users` | Identidad única: la misma tabla para usuarios de clientes y staff de GPI |
| `tenant_memberships` | A qué cliente pertenece cada usuario y con qué rol. **Uno como máximo** |
| `platform_admins` | **En desuso y vacía.** Reservada para el backoffice externo |
| `sessions` | Refresh tokens (guarda el hash, nunca el token) |
| `invitations` | Invitaciones pendientes |
| `password_resets` | Recuperación de contraseña, de un solo uso |
| `audit_log` | Rastro de quién hizo qué |

Dos decisiones que conviene entender:

- **Una sola tabla de usuarios, no dos.** Separar "usuarios de clientes" de "admins de GPI" en dos
  tablas parece más limpio pero significa dos flujos de login, dos lógicas de hash y dos sitios
  donde olvidarse de bloquear una cuenta comprometida.

- **Un usuario pertenece como mucho a UN cliente.** El diseño inicial permitía la cuenta compartida
  entre varios clientes con un rol distinto en cada uno, y `platform_admins` daba además un
  privilegio sobre todos. Las dos cosas se descartaron: los clientes son estancos y no puede haber
  permisos cruzados de ningún tipo. Lo garantiza el índice único
  `memberships_un_tenant_por_usuario` sobre `tenant_memberships (user_id)`, y `platform_admins`
  queda vacía, reservada para el **backoffice externo** que dará de alta clientes y sus admins.
  Ver [`crm/006_un_tenant_por_usuario.sql`](crm/006_un_tenant_por_usuario.sql).

## 3. Correcciones de tipo

| Columna | Antes | Ahora | Por qué |
|---|---|---|---|
| `leads_renovaciones.chat_id` | `text` | `bigint` | Era `bigint` en `leads` y `text` aquí: las dos tablas no se podían cruzar sin castear, y un índice sobre el cast no se usa |
| `buffer.created_at` | `timestamp` (sin zona) | `timestamptz` | Con servidores en UTC y usuarios en UY/ES, una marca sin zona horaria da desfases de horas. Era la única columna de fecha del esquema sin zona; el resto ya era `timestamptz` |
| `leads.id` | `integer` (serial) | `bigint` (identity) | `integer` se agota a los 2.147 millones. Y `GENERATED ALWAYS AS IDENTITY` es el estándar SQL: impide que alguien inserte un id a mano y desincronice la secuencia |
| `leads_renovaciones.id` | `bigint` (serial) | `bigint` (identity) | Ídem |
| `buffer.id` | `integer` (serial) | `bigint` (identity) | Ídem |

## 4. Renombrado: `alumno` → `cliente`

Sale de tus propias notas de Clase 2: *"Cambio alumno por cliente para generalización"*. GPI ya no
sirve solo a formación, y una columna que se llama `alumno` en el CRM de una empresa de trading no
significa nada.

## 5. Nullabilidad: casi todo pasa a NOT NULL

En el esquema viejo, **diecisiete columnas eran nullable teniendo un default** (la mitad del total). Por ejemplo `cerrado`
era `boolean NULL DEFAULT false`.

Eso es una trampa: un booleano nullable tiene tres valores (`true`, `false`, `NULL`), y
`WHERE NOT cerrado` **no devuelve las filas donde `cerrado` es NULL**. Un lead con NULL ahí
desaparece silenciosamente de cualquier consulta que filtre por ese campo.

Ahora toda columna con default es `NOT NULL`. Siguen admitiendo NULL solo las que representan un
dato genuinamente ausente: `name`, `username`, `satisfaccion`, `producto_interes`,
`fecha_link_enviado`.

## 6. Reglas de integridad que antes no existían

El volcado no mostraba ni un solo `CHECK`. Ahora hay 53 constraints. Los que más importan:

- `leads_contexto_es_objeto`, `leads_progreso_es_objeto`, `leads_estado_es_objeto` — que las
  columnas `jsonb` contengan realmente un objeto. Sin esto, `jsonb` acepta `"hola"` o `42` como
  valores válidos y el código que hace `contexto->>'campo'` revienta en tiempo de ejecución.
- `leads_audios_es_array` — ídem para `audios_enviados`, que debe ser un array.
- `renovaciones_link_coherente` — si `link_enviado` es true tiene que haber `fecha_link_enviado`,
  y al revés. Estados imposibles que antes se podían escribir.
- `leads_turnos_no_negativos`, `leads_fu_no_negativo` — contadores que no pueden ir hacia atrás.
- `users_activo_con_password` — un usuario `active` sin `password_hash` no puede existir.
- `tenants_slug_format` — el slug va en subdominios: minúsculas, dígitos y guiones.

## 7. Índices

El volcado no traía ninguno. Ahora hay 35, todos empezando por `tenant_id` porque es el filtro que
lleva **toda** consulta bajo RLS. Dos merecen mención:

- `leads_revision_humana_idx` es **parcial** (`WHERE requires_human_review`): la bandeja de "esto lo
  mira un humano" son pocas filas sobre muchas, así que el índice ocupa una fracción.
- `memberships_un_solo_owner` es un índice único parcial que garantiza **un solo `owner` por
  tenant**. Para iguales está el rol `admin`, que sí admite varios.
- `memberships_un_tenant_por_usuario` es único sobre `(user_id)` y garantiza **un solo cliente por
  usuario**. Es la pieza que hace que la independencia entre clientes no dependa del backend.

## 8. `updated_at` ahora se mantiene solo

Antes `updated_at` tenía `DEFAULT now()`, que solo actúa en el INSERT: **en un UPDATE se quedaba con
la fecha de creación** salvo que la aplicación lo escribiera a mano cada vez. Ahora hay un trigger
`BEFORE UPDATE` en las cinco tablas que la tienen.

## 9. `citext` para email y slug

`auth.users.email` y `auth.tenants.slug` son `citext`, no `text`. Con `text`,
`Rodrigo@x.com` y `rodrigo@x.com` son dos valores distintos y el `UNIQUE` deja pasar la cuenta
duplicada.

---

## Lo que NO se pudo replicar y sigue pendiente

### `leads_renovaciones.fase` sigue siendo `text`

En el plan dije que lo convertiría a enum, igual que `fase_lead`. **No se puede todavía.** El
volcado solo muestra el default (`'inicio'`); los demás valores no aparecen por ningún lado.
Inventar el dominio rompería el bot en cuanto escribiera una fase no listada.

Queda como `text` con un `CHECK` que solo exige que no esté vacía. **Para cerrarlo hace falta la
lista real de fases del embudo de renovación.**

### `crm.fase_lead` se reconstruyó por inferencia, no por evidencia

Los siete valores (`situacion`, `vision`, `obstaculo`, `compromiso`, `objecion`, `llamada`, `link`)
salen de cruzar el default `'situacion'::fase_lead` del volcado con la constante `FASES` del
frontend, y fueron confirmados a mano. **No están en el volcado.** Si el sistema viejo tenía algún
valor extra que nunca se usó como default ni llegó al front, no aparece aquí y la migración de
datos futura fallará en esa fila.

### Claves foráneas del esquema viejo: desconocidas

El volcado no las trae. Las relaciones actuales (`leads.tenant_id → auth.tenants.id`, etc.) son
diseño nuevo, no una reconstrucción. En particular, **`buffer` deliberadamente NO tiene FK a
`leads`**: un mensaje puede llegar antes de que exista la fila del lead, y una FK haría fallar la
primera inserción de cada conversación nueva.

### Los datos viejos no están migrados

La base arranca vacía, con datos sintéticos de dev (2 clientes × 3 conversaciones). La migración
real es un trabajo aparte y necesita acceso al origen.
