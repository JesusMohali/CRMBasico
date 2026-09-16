# Chat

## Resumen

Se reconstruyó la pantalla de chat como una interfaz de dos paneles, inspirada en la tercera referencia visual:

- Panel izquierdo para buscar y seleccionar conversaciones.
- Panel derecho para ver la conversación activa.
- Encabezado con identidad y estado del contacto.
- Lista de mensajes con diferenciación entre recibidos y enviados.
- Campo para redactar y enviar mensajes.
- Diseño responsive para escritorio, tablet y móvil.
- Compatibilidad con modo claro y modo oscuro mediante las variables visuales existentes.

## Archivos agregados

- `src/components/chat/ChatSidebar.vue`: lista de conversaciones y buscador.
- `src/components/chat/ChatWindow.vue`: encabezado, mensajes y composer.
- `src/views/ChatsLead.vue`: estado de conversaciones, selección, filtrado y envío local.

## Archivos modificados

- `src/router/index.ts`: agrega la ruta `/chats` y devuelve `/public-profile` a su vista correcta.
- `src/components/layout/Sidebar.vue`: agrega el enlace Chat en el menú lateral.
- `src/styles.css`: agrega el sistema visual y responsive del chat.

## Cómo funciona

1. El usuario entra a `/chats` desde el nuevo enlace Chat del sidebar.
2. `ChatsLead.vue` mantiene la conversación seleccionada y el mapa de mensajes.
3. El buscador filtra la lista por nombre o vista previa del mensaje.
4. Al seleccionar una conversación, el panel derecho cambia de contacto y mensajes.
5. Al enviar texto, se agrega inmediatamente como mensaje propio y se actualiza la vista previa de la conversación.
6. La información actual vive en memoria del navegador. Todavía no existe persistencia ni comunicación con un backend.

## Próximos pasos para producción

- Crear una API para conversaciones y mensajes.
- Sustituir `messageMap` por datos obtenidos desde el backend.
- Persistir mensajes enviados y estados de lectura.
- Añadir paginación o carga incremental de mensajes.
- Conectar llamadas, videollamadas, adjuntos y notificaciones.
- Añadir autenticación y permisos por conversación.
- Guardar la última conversación seleccionada.

## Rutas

| Ruta | Vista |
| --- | --- |
| `/chats` | Chat de dos paneles |
| `/public-profile` | Vista de Public Profile |
| `/overview` | Dashboard principal |

## Nota sobre assets

Los avatares usados son imágenes existentes del proyecto. Para una versión final conviene mover la selección de avatar a una configuración compartida o importar los assets con Vite para que la resolución también sea completamente estable en producción.
