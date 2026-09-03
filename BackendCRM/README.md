# BackendCRM — API de autenticación

Node 22 · TypeScript · Fastify 5 · PostgreSQL (la RDS compartida, base `crm_<env>`).

El esquema de datos **no vive aquí**: es del repo de infraestructura (`sql/crm/*.sql`), y está
documentado en `schema/ESQUEMA.md` de ese repo.

## Arrancar en local

```bash
npm install
cp .env.example .env      # editar DATABASE_URL y JWT_SECRET
npm run dev
```

Para probar contra una base desechable:

```bash
docker run -d --name pg-crm-test -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:17-alpine
npm test
```

Los tests levantan el esquema completo, siembran dos clientes con sus usuarios y ejercitan la API
de punta a punta. **25 pruebas** contra Postgres de verdad, porque lo que se está probando es en
buena parte comportamiento de la base (RLS, constraints, transacciones). El único doble de la suite
es el cliente de SES: al otro lado de ese no hay un contenedor que levantar, hay AWS.

`test/schema.sql` es una copia consolidada del DDL de infra, generada por `test/sync-schema.sh`.
Si el esquema cambia allí, hay que regenerarla y commitearla.

## Endpoints

| Método | Ruta | Quién | Qué hace |
|---|---|---|---|
| POST | `/api/auth/login` | público | Entra. Devuelve access + refresh y el tenant si solo hay uno |
| POST | `/api/auth/refresh` | público | Rota el refresh token |
| POST | `/api/auth/password/forgot` | público | Pide enlace de recuperación. **Siempre 202** |
| POST | `/api/auth/password/reset` | público | Fija la contraseña nueva con el token |
| POST | `/api/auth/invitations/accept` | público | Acepta invitación, crea la cuenta y entra |
| GET | `/api/auth/me` | autenticado | Perfil, membresías y rol de plataforma |
| POST | `/api/auth/logout` | autenticado | Cierra la sesión (o todas con `{"todas":true}`) |
| POST | `/api/auth/tenant` | autenticado | Cambia el cliente activo |
| POST | `/api/auth/password/change` | autenticado | Cambia contraseña y cierra todas las sesiones |
| GET | `/api/members` | member+ | Miembros del cliente activo |
| POST | `/api/members/invitations` | admin+ | Invita a alguien |
| PATCH | `/api/members/:usuarioId` | admin+ | Cambia el rol de un miembro |
| DELETE | `/api/members/:usuarioId` | admin+ | Quita a un miembro |
| GET | `/healthz` | público | Liveness. **No toca la base** |
| GET | `/readyz` | público | Readiness. Sí la toca |

`healthz` no consulta la base a propósito: si lo hiciera, una caída de la RDS haría que ECS matara
y recreara tasks perfectamente sanas en bucle.

## Decisiones que conviene conocer antes de tocar esto

**La aplicación se conecta como `crm_<env>_app`, nunca como `crm_<env>`.** El dueño se salta RLS
por ser dueño de las tablas; con esa credencial el aislamiento por tenant sencillamente no
existiría. Es la diferencia entre tener multitenancy y creer que se tiene.

**Todo lo que toca datos de un cliente pasa por `conTenant()`**, que abre transacción y fija
`app.tenant_id` con `set_config(..., true)`. El `true` es `LOCAL`: sin él, con pool de conexiones,
el valor se queda pegado a la conexión y la siguiente petición —que puede ser de otro cliente— lo
hereda.

**Escribir y lanzar una excepción en la misma transacción pierde la escritura.** Suena obvio y
mordió dos veces: el contador de intentos fallidos y la revocación masiva por reutilización de
token se hacían justo antes de un `throw`, y el `ROLLBACK` los deshacía — la cuenta no se bloqueaba
nunca y la contramedida contra robo de tokens no revocaba nada. Ambos casos van ahora en
transacción propia que se confirma **antes** de rechazar la petición. Hay un test para cada uno.

**Los refresh token rotan y detectan reutilización.** Cada refresh revoca el anterior. Si aparece
uno ya revocado, se asume copia robada y se cortan *todas* las sesiones del usuario.

**El rol se relee de la base en cada refresh**, no se arrastra del token: bajar a alguien de admin
a viewer surte efecto en el siguiente refresh, no cuando caduque una sesión de 30 días.

**El login no filtra si un email existe.** Ante un email desconocido se gasta el mismo tiempo que
costaría verificar un hash real, y la respuesta es idéntica a la de contraseña incorrecta. Hay un
test que compara ambas respuestas.

**El correo sale por Amazon SES y un fallo de envío no rompe la petición.** Cuando se manda el
correo, la invitación (o el token de recuperación) ya está escrita y confirmada en la base. Un 500
ahí le diría al usuario que no se hizo nada cuando sí se hizo, y al reintentar se encontraría con
"esa persona ya pertenece a este cliente". El fallo se registra con `log.error` y la petición sigue:
el correo siempre se puede reenviar. Con `EMAIL_ENABLED=false` no se manda nada y el token sale por
el log — es la única forma de seguir el flujo en local, y es lo que usan los tests.

**La conexión a la RDS verifica el certificado del servidor.** `certs-rds-global.pem` (el bundle
global de CA de AWS) viaja en la imagen y se pasa como `ca` con `rejectUnauthorized: true`. Si el
fichero no está y el TLS está activo, el proceso **no arranca**: cifrar sin verificar protege de
quien escucha el cable pero no de quien se pone en medio, y ese "va cifrado" pasa desapercibido
durante meses.

## Lo que falta

- **Despliegue.** No hay repositorio de ECR, ni servicio de ECS, ni regla del ALB para esta API.
  El `Dockerfile` está listo y probado, pero la infraestructura hay que crearla.
- **Identidad de SES.** El dominio del remitente (`EMAIL_FROM`) tiene que estar verificado en SES
  y la cuenta fuera del sandbox; la task necesita permiso `ses:SendEmail`.
