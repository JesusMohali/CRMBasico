import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// En producción la SPA y la API comparten origen: el ALB manda /api/* a la API
// y todo lo demás al nginx que sirve esta app, así que el navegador nunca hace
// una petición cruzada y no hay CORS configurado en el backend.
//
// En `npm run dev` eso no pasa: Vite sirve en localhost:5173 y las llamadas a
// /api/... morirían ahí mismo. Este proxy reproduce el reparto del ALB, y de
// paso mantiene el mismo origen desde el punto de vista del navegador — que es
// justo lo que hace innecesario tocar CORS.
const API_POR_DEFECTO = 'https://crm-dev.gopeakintelligence.com'

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '')

	return {
		plugins: [
			vue(),
			vueDevTools(),
			tailwindcss(),
		],
		resolve: {
			alias: {
				'@': fileURLToPath(new URL('./src', import.meta.url)),
			},
		},
		server: {
			fs: { allow: ['..'] },
			proxy: {
				'/api': {
					target: env.VITE_API_PROXY || API_POR_DEFECTO,
					changeOrigin: true,
					secure: true,
				},
			},
		},
	}
})
