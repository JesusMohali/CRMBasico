# Peak Intelligence (FrontendCRM) — Auditoría técnica

> Analizado a partir del ZIP subido (61 MB, sin `node_modules` ni `dist`). Repo git con historial (`Initial commit` → `add cards in dashboard`). Carpeta real de trabajo: `PeakIntelligence/PeakIntelligence/FrontendCRM`.

---

## 1. Hallazgo central (lee esto primero)

El `package.json` se llama **`metronic-vue-demo10`**, tiene `@keenthemes/ktui` como dependencia y Tailwind 4 instalado — pero **el código fuente no usa nada de eso**:

- `@keenthemes/ktui` está en `package.json` y se resuelve bien en el lockfile, pero **cero referencias** en todo `src/` (`grep -r "ktui" src/` → sin resultados). No se inicializa en ningún componente.
- Tailwind está importado (`@import 'tailwindcss'` en `styles.css`), pero las plantillas **no usan clases utilitarias de Tailwind** (`flex`, `grid`, `p-4`, etc.). La única aparición real de una clase Tailwind (`rounded-full gap-1`) está dentro de un bloque **comentado** en `TeamsTable.vue` — parece un fragmento pegado como referencia desde la demo real de Metronic, nunca activado.
- Todo el layout (`sidebar`, `topbar`, `modal`, `drawer`, `kt-card`, `kt-btn`...) está resuelto con **~700 líneas de CSS propio escrito a mano** en `src/styles.css`, con nombres inspirados en la convención de Metronic (`kt-btn`, `kt-card`) pero sin relación con el CSS/Tailwind que Metronic realmente genera.

**En otras palabras:** este proyecto no es "Metronic envuelto en Vue" (el plan que discutimos con el HTML del starter kit). Es una **recreación visual manual, inspirada en Metronic**, con Keenicons real como único ingrediente compartido. Eso no es malo — de hecho como prototipo funciona bien — pero es importante saberlo antes de seguir construyendo sobre esta base, porque cualquier página nueva no "hereda" nada de Metronic automáticamente: hay que seguir escribiendo CSS a mano como se hizo hasta ahora, o parar y hacer la migración real que se planteó (traer el HTML/CSS de Metronic e integrarlo).

---

## 2. Dependencias e instalación — ✅ todo resuelve bien

Verifiqué cada paquete de `package.json` contra `package-lock.json`: **las 12 dependencias resuelven correctamente**, incluyendo `@keenthemes/ktui` (resuelto en `1.2.7` desde el registro oficial de npm). No hay paquetes fantasma ni versiones rotas.

| Paquete | Rango pedido | Resuelto |
|---|---|---|
| vue | ^3.5.13 | 3.5.41 |
| vue-router | ^4.6.4 | 4.6.4 |
| pinia | ^3.0.3 | 3.0.4 |
| @keenthemes/ktui | ^1.2.4 | 1.2.7 |
| apexcharts | ^4.7.0 | 4.7.0 |
| tailwindcss / @tailwindcss/vite | ^4.1.10 | 4.3.3 |
| vite | ^6.3.5 | 6.4.3 |
| typescript | ^5.8.3 | 5.9.3 |
| vue-tsc | ^2.2.10 | 2.2.12 |

`npm install` debería correr sin fricción. Borraste bien `node_modules` y `dist` — ninguno de los dos se referencia desde el código (`dist/` solo aparece como un `bin` interno de `rollup` dentro del lockfile, irrelevante). `.gitignore` ya excluye ambos correctamente.

---

## 3. Lo que falta instalar/crear — ⚠️ un archivo real

**Falta `src/vite-env.d.ts`** (o `env.d.ts`) con:

```ts
/// <reference types="vite/client" />
```

Este archivo es estándar en cualquier scaffold de Vite+TS y **no existe en el proyecto**. Sin él, TypeScript no reconoce:

- `import.meta.glob(...)` — usado en `ChatSidebar.vue` y `ChatWindow.vue` para cargar avatares.
- Los imports de assets como `.svg` (`import logo from '.../mini-logo-circle-success.svg'`) — usados en `Sidebar.vue` y `Topbar.vue`.

**Efecto real:** `npm run dev` funciona sin problema (Vite no type-checkea, solo transpila con esbuild). Pero `npm run build` ejecuta `vue-tsc -b && vite build` — y `vue-tsc` sí va a fallar con errores como `Property 'glob' does not exist on type 'ImportMeta'` y `Cannot find module '...svg'`. Es decir: **el proyecto probablemente no compila para producción tal como está.**

Solución de un minuto: crear ese archivo en `src/`.

*(Nota menor: `tsconfig.tsbuildinfo` que subiste tiene rutas viejas de una reorganización de carpetas anterior — `stores.ts`, `applayout.vue` sueltos en vez de las subcarpetas actuales. Es caché, no rompe nada, pero puedes borrarlo; ya está en `.gitignore`.)*

---

## 4. Clases e íconos que no van a verse — 🐛 bugs concretos

Comparé cada clase e ícono usado en las plantillas contra lo que realmente existe en `styles.css` y en el bundle de Keenicons:

- **`kt-badge` / `kt-badge-secondary`** (usadas en `TeamsTable.vue` para mostrar la "Fase" del lead) — **no están definidas en ningún lado.** Van a renderizarse como texto plano sin fondo, padding ni color. Es el mismo patrón del `rounded-full gap-1` comentado: alguien copió el snippet real de Metronic como referencia y el componente final se quedó a medio terminar.
- **`ki-video`** (botón "Start video call" en `ChatWindow.vue`) — **este ícono no existe en el set de Keenicons instalado.** Verifiqué el bundle completo: cero coincidencias para "video". El botón se va a ver vacío (sin ícono). Keenicons sí trae `ki-call`, que podría ser el reemplazo más cercano.
- Todos los demás íconos usados (`ki-home-3`, `ki-message-text`, `ki-setting-2`, `ki-users`, `ki-calendar`, `ki-briefcase`, `ki-star`, `ki-paper-plane`, etc.) **sí existen** y están bien referenciados.
- Clases como `kt-drawer`, `kt-modal`, `kt-menu`, `kt-menu-dropdown` tampoco tienen CSS propio, pero no se nota porque siempre van acompañadas de una clase custom que sí tiene el estilo real (`.drawer`, `.modal`, `.user-menu`, `.date-dropdown`). Son decorativas/inertes, no bugs visibles.

---

## 5. Qué tan completo está realmente el proyecto

El router define 16 rutas, pero solo 2 tienen una vista construida a propósito:

| Ruta | Estado |
|---|---|
| `/overview` (Dashboard) | ✅ Completa: stats cards, tabla de leads con búsqueda/paginación (Pinia), gráfico ApexCharts |
| `/chats` | ✅ Completa: dos paneles, búsqueda, envío de mensajes en memoria (documentado en `CHAT.md`) |
| `/public-profile`, `/profiles`, `/projects`, `/works`, `/teams`, `/my-account`, `/billing`, `/security`, `/members-roles`, `/network*` (10 rutas) | 🟡 Todas apuntan a `SectionView.vue`, un placeholder genérico ("This page is ready for its content") |
| Autenticación | ❌ No existe. Hay una carpeta `src/components/authentication/` vacía, sin login, sin guards de rutas, sin store de sesión |

El chat, el dashboard y el sistema de temas claro/oscuro (vía Pinia + `localStorage`) están sólidamente implementados y son código limpio, idiomático de Vue 3 (Composition API, `defineModel`, transiciones).

---

## 6. Detalles menores (no bloquean nada)

- `TeamsTable.vue` tiene un `console.log` de debug dentro de `toggleAll()`.
- La columna de checkboxes de selección múltiple en la tabla de leads está completamente comentada — la lógica (`allSelected`, `toggleAll`) existe pero no se usa.
- `DashboardOverview.vue` importa `useUiStore` pero no lo usa en el template visible (queda de una sección comentada).
- `src/assets/media/illustrations/32.svg` no se usa en ningún lado activo (solo aparece en un bloque comentado).
- El `<title>` en `index.html` dice "Peak Intelligence", pero el nombre interno en `package.json` sigue siendo `metronic-vue-demo10` — vale la pena renombrarlo para evitar confusión a futuro.

---

## 7. Qué recomendaría a partir de aquí

Dado que el objetivo original era migrar a Metronic de verdad (HTML → Vue SFC, como hablamos con el starter kit), hay dos caminos honestos:

1. **Aceptar que este es un producto propio "estilo Metronic"** y seguir así: seguirás escribiendo CSS a mano por cada página nueva, arreglando clases sueltas como `kt-badge` cuando aparezcan. Es más rápido a corto plazo, pero no te vas a beneficiar de los 39 layouts ni de los componentes ya resueltos que trae el paquete real de Metronic.
2. **Retomar el plan de migración real**: traer el CSS/Tailwind compilado de `metronic-tailwind-html-starter-kit` (el que ya analizamos) y usarlo como base de estilos en lugar del `styles.css` hecho a mano. Esto sí te daría `kt-badge`, `kt-menu` con acordeones reales, etc. "gratis", y ahí `@keenthemes/ktui` — que ya está instalado pero sin usar — finalmente tendría sentido inicializarlo para el comportamiento de drawers/modales/menús.

No es una decisión que tenga que tomarse hoy, pero si vas a seguir agregando páginas (las 10 que hoy son placeholders), vale la pena decidirlo antes de multiplicar el CSS a mano por 10 páginas más.
