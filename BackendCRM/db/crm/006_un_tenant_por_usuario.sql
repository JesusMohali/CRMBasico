-- 006 — Un usuario pertenece como mucho a UN tenant.
--
-- QUÉ CAMBIA RESPECTO A 002: el modelo original permitía que una misma cuenta
-- tuviera membresía en varios clientes, con un rol distinto en cada uno. Se
-- descarta. **Cada cliente es completamente independiente y no puede haber
-- permisos cruzados de ningún tipo**: ni una cuenta compartida entre dos
-- clientes, ni un rol de plataforma que los vea a todos.
--
-- POR QUÉ EN EL MOTOR Y NO EN EL CÓDIGO: la independencia entre clientes es la
-- promesa central del producto, y una promesa que depende de que ningún
-- endpoint se olvide de comprobarla no es una garantía, es una intención. Un
-- índice único no se olvida: si alguien —la aplicación, un backoffice, una
-- consulta a mano en producción— intenta dar a un usuario una segunda
-- membresía, el INSERT falla. Es el mismo razonamiento que RLS en 004: el
-- aislamiento lo impone Postgres, no la buena memoria de quien escribe el
-- backend.
--
-- Idempotente: se puede correr las veces que haga falta.

-- ── 1. Membresías sobrantes ──────────────────────────────────────────────────
-- Antes de poder crear el índice hay que dejar como mucho una fila por usuario.
-- Se conserva la MÁS ANTIGUA: es la pertenencia original, y las que se añadieron
-- después son justamente las cruzadas que este cambio prohíbe.
--
-- El desempate por `id` no es decorativo: las membresías sembradas en un mismo
-- INSERT comparten `created_at` al microsegundo, así que sin él "la más antigua"
-- no estaría definida y el resultado dependería del plan de ejecución.
WITH ordenadas AS (
  SELECT id,
         row_number() OVER (PARTITION BY user_id ORDER BY created_at, id) AS n
    FROM auth.tenant_memberships
)
DELETE FROM auth.tenant_memberships m
 USING ordenadas o
 WHERE m.id = o.id
   AND o.n > 1;

-- ── 2. La garantía ───────────────────────────────────────────────────────────
-- Un usuario, una membresía. Esto sustituye en la práctica a
-- `memberships_unica UNIQUE (tenant_id, user_id)` como garantía fuerte —aquella
-- solo impedía la fila repetida DENTRO del mismo tenant, no la pertenencia a
-- dos—, pero se deja la existente: no estorba y documenta la intención.
CREATE UNIQUE INDEX IF NOT EXISTS memberships_un_tenant_por_usuario
  ON auth.tenant_memberships (user_id);

-- `memberships_user_idx` era un btree NO único sobre exactamente la misma
-- columna. El índice único de arriba resuelve las mismas búsquedas
-- (`WHERE user_id = $1`, que es la consulta del login), así que mantener los dos
-- solo cuesta escrituras y espacio. Se retira el redundante.
DROP INDEX IF EXISTS auth.memberships_user_idx;

COMMENT ON TABLE auth.tenant_memberships IS
  'Qué usuario pertenece a qué cliente y con qué rol. UNA membresía como máximo por usuario: los clientes son estancos y no hay permisos cruzados. Lo garantiza el índice único memberships_un_tenant_por_usuario, no la aplicación.';

-- ── 3. platform_admins deja de usarse ────────────────────────────────────────
-- No se borra la tabla: queda reservada para el backoffice externo desde el que
-- se darán de alta clientes y sus usuarios admin. Pero mientras tanto se vacía,
-- porque una fila aquí describía justo lo que este cambio elimina: una cuenta
-- con visibilidad sobre todos los clientes. La API de autenticación ya no
-- consulta esta tabla.
--
-- El DELETE va sin WHERE a propósito y se ejecuta en cada apply: si alguien
-- concede un privilegio de plataforma a mano, la siguiente migración lo revoca.
DELETE FROM auth.platform_admins;

COMMENT ON TABLE auth.platform_admins IS
  'EN DESUSO. La API de autenticación NO consulta esta tabla y debe permanecer vacía: ningún usuario de la aplicación puede tener visibilidad sobre varios clientes. Se conserva —vacía— reservada para el backoffice externo de alta de clientes, que se construirá aparte y es el único que volverá a escribir aquí.';
