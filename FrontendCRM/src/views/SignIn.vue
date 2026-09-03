<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AuthShell from '@/components/auth/AuthShell.vue';
import { mensajeDeError } from '@/lib/api';
import { useSesionStore } from '@/stores/sesion';

const router = useRouter();
const route = useRoute();
const sesion = useSesionStore();

const email = ref('');
const password = ref('');
const showPassword = ref(false);
const keepLoggedIn = ref(false);
const enviando = ref(false);
const error = ref('');

/**
 * A dónde volver después de entrar. El guard deja el destino en `redirigir`,
 * pero eso lo escribe cualquiera en la URL: solo se aceptan rutas internas. Un
 * valor que empiece por "//" o por "http" sería un redirect abierto — el enlace
 * de phishing clásico que sale de un login legítimo.
 */
function destinoTrasEntrar(): string {
	const pedido = route.query.redirigir;
	if (typeof pedido === 'string' && pedido.startsWith('/') && !pedido.startsWith('//')) return pedido;
	return '/overview';
}

async function handleSubmit() {
	if (enviando.value) return;
	enviando.value = true;
	error.value = '';

	try {
		// El checkbox por fin significa algo: decide si el refresh token va a
		// localStorage (sobrevive al navegador) o a sessionStorage (muere con la
		// pestaña). Ver el comentario largo en stores/sesion.ts.
		await sesion.login(email.value.trim(), password.value, keepLoggedIn.value);
		router.replace(destinoTrasEntrar());
	} catch (fallo) {
		// El backend contesta 401 sin decir si falló el email o la contraseña
		// (a propósito: si lo dijera, este formulario serviría para averiguar qué
		// cuentas existen). El 403 en cambio sí es informativo: la contraseña era
		// correcta, pero la cuenta no puede entrar.
		error.value = mensajeDeError(fallo, {
			401: 'Correo o contraseña incorrectos.',
			403: 'Tu cuenta está deshabilitada o no pertenece a ningún cliente. Hablá con tu administrador.',
			429: 'Demasiados intentos fallidos. Esperá unos minutos antes de volver a probar.',
		});
	} finally {
		enviando.value = false;
	}
}
</script>

<template>
	<AuthShell titulo="¡Bienvenido a Peak Intelligence!" subtitulo="Iniciá sesión con tu correo y contraseña">
		<form class="auth-form" @submit.prevent="handleSubmit">
			<p v-if="error" class="auth-alert auth-alert-error" role="alert">
				<i class="ki-filled ki-information-2" /><span>{{ error }}</span>
			</p>

			<div class="auth-field">
				<label class="kt-form-label font-normal text-mono">Correo</label>
				<input v-model="email" class="kt-input" type="email" placeholder="nombre@empresa.com" autocomplete="email" :disabled="enviando" required />
			</div>

			<div class="auth-field">
				<div class="auth-field-head">
					<label class="kt-form-label font-normal text-mono">Contraseña</label>
					<RouterLink class="kt-link" to="/forgot-password">¿Olvidaste tu contraseña?</RouterLink>
				</div>
				<div class="kt-input">
					<input v-model="password" :type="showPassword ? 'text' : 'password'" placeholder="Ingresá tu contraseña" autocomplete="current-password" :disabled="enviando" required />
					<button class="kt-btn kt-btn-sm kt-btn-ghost kt-btn-icon" type="button" :aria-label="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'" @click="showPassword = !showPassword">
						<i class="ki-filled" :class="showPassword ? 'ki-eye-slash' : 'ki-eye'" />
					</button>
				</div>
			</div>

			<label class="kt-label">
				<input v-model="keepLoggedIn" class="kt-checkbox kt-checkbox-sm" type="checkbox" :disabled="enviando" />
				<span class="kt-checkbox-label">Mantener sesión iniciada</span>
			</label>

			<button class="kt-btn kt-btn-primary auth-submit" type="submit" :disabled="enviando">
				{{ enviando ? 'Entrando…' : 'Iniciar sesión' }}
			</button>
		</form>
	</AuthShell>
</template>
