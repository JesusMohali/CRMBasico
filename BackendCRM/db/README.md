# `db/` — El esquema de datos del CRM

**Esta es la fuente de verdad del esquema.** El DDL de `crm/` es exactamente lo que se aplica
sobre la RDS; todo lo demás (la documentación de aquí, `../test/schema.sql`) se deriva de él.

Vivía en el repo de infraestructura. Se movió aquí porque el esquema es del producto, no de la
plataforma: quien toca el backend puede leerlo y cambiarlo sin clonar otro repo, y los tests
dejan de depender de tener la infra al lado.

## Qué hay

| Fichero | Qué es |
|---|---|
| `crm/00*.sql` | **El DDL.** Se aplican en orden. Todos idempotentes |
| `crm/900_seed_dev.sql` | Datos sintéticos para dev. Bloqueado para prod |
| `apply-crm-schema.sh` | Aplica el DDL sobre `crm_<env>` |
| `verify-crm-rls.sh` | 11 comprobaciones de que el aislamiento por tenant funciona |
| **[ESQUEMA.md](ESQUEMA.md)** | El esquema completo, tabla por tabla |
| **[CAMBIOS-VS-ANTERIOR.md](CAMBIOS-VS-ANTERIOR.md)** | Qué cambió respecto al sistema viejo y qué no se pudo replicar |
| `pgweb-1788354784.json` | El volcado del esquema anterior. Se conserva como evidencia de dónde salió todo |

Los `.md` son documentación: si discrepan del SQL, manda el SQL.

## Cómo se aplica

La RDS no es pública, así que va desde el bastión:

```bash
aws ssm start-session --target i-003253ff758c327f5
```

Con los ficheros de `db/` copiados allí:

```bash
# 1. Crear la base y los tres roles. Este script vive en el repo de INFRA
#    (sql/provision-databases.sh) porque también provisiona n8n y LiteLLM.
./provision-databases.sh dev

# 2. Esquema (+ datos sintéticos)
./apply-crm-schema.sh dev --seed

# 3. Comprobar el aislamiento
./verify-crm-rls.sh dev
```

Ninguno lleva contraseñas: las leen de SSM (`/gpi/<env>/crm/*`) y de Secrets Manager. Los tres son
idempotentes. `--seed` está bloqueado para `prod`.

## Los tres roles

Una sola base, `crm_<env>`, con tres roles — y ahí está la gracia:

| Rol | Quién | RLS |
|---|---|---|
| `crm_<env>` | Dueño. DDL, migraciones y seeds | **Se la salta** (por ser dueño) |
| `crm_<env>_app` | El backend | Sí aplica |
| `crm_<env>_bot` | n8n. Solo el schema `crm`, nada de `auth` | Sí aplica |

**El backend nunca debe conectarse como dueño.** Con esa credencial el aislamiento por tenant
sencillamente no existe. Por eso `DATABASE_URL` lleva `crm_<env>_app`.

## Si cambia el esquema

1. Añadir un fichero nuevo en `crm/` (no editar los ya aplicados) y sumarlo a `apply-crm-schema.sh`.
2. Correr `../test/sync-schema.sh` para regenerar `../test/schema.sql` y `../test/seed.sql`, que es
   lo que levanta el Postgres desechable de los tests.
3. Actualizar `ESQUEMA.md`.
4. Aplicar con `apply-crm-schema.sh` y verificar con `verify-crm-rls.sh`.

## Estado a 2026-09-03

Aplicado y verificado en `crm_dev`: 11 tablas, 4 con RLS, 11/11 comprobaciones de aislamiento en
verde. Datos sintéticos: 2 clientes (`acme-formacion`, `planb-trading`) con 3 conversaciones cada
uno y **un único usuario admin por cliente**, sin membresías cruzadas y sin ningún admin de
plataforma — un usuario pertenece como mucho a un cliente y lo impone un índice único
(`crm/006_un_tenant_por_usuario.sql`).

Las cuentas sembradas **no pueden iniciar sesión**: su `password_hash` tiene forma de Argon2id pero
no corresponde a ninguna contraseña. Sembrar una contraseña conocida en una base alcanzable sería
regalar un acceso.

`crm_prod` todavía no existe.

## Lo que queda abierto

1. **`leads_renovaciones.fase` sigue siendo `text`.** Faltan los valores reales del embudo de
   renovación para convertirlo a enum. Ver [CAMBIOS-VS-ANTERIOR.md](CAMBIOS-VS-ANTERIOR.md).
2. **Migración de los datos viejos.** Pendiente, necesita acceso al sistema de origen.
3. **Personalización de prompts por cliente.** `auth.tenants.settings` (jsonb) está reservado para
   eso, pero el modelo concreto no está diseñado.
