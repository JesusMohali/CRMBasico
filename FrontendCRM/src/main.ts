import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useSesionStore } from './stores/sesion'
import './styles.css'

const app = createApp(App)
app.use(createPinia())

const sesion = useSesionStore()

// Cuando la sesión se cae en mitad de la navegación (refresh caducado o
// revocado), la capa HTTP avisa al store y el store llama a esto. La
// redirección se enchufa desde aquí y no desde el propio store porque el router
// ya importa el store: hacerlo al revés sería un ciclo de imports.
sesion.registrarSalidaForzada(() => {
	const actual = router.currentRoute.value
	if (actual.meta.publica) return
	router.replace({ path: '/sign-in', query: { redirigir: actual.fullPath } })
})

// Se monta DESPUÉS de saber si hay sesión. El access token vive solo en memoria,
// así que tras cada recarga hay que canjear el refresh token guardado; montar
// antes enseñaría el login durante un instante a quien sí estaba dentro.
// `.finally` y no `.then`: si el arranque falla, la app tiene que aparecer igual
// (en el login, que es lo correcto cuando no se pudo recuperar la sesión).
sesion.cargarSesion().finally(() => {
	app.use(router)
	app.mount('#app')
})
