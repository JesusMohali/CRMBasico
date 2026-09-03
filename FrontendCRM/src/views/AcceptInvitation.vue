<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AuthShell from '@/components/auth/AuthShell.vue';
import { mensajeDeError, peticionPublica } from '@/lib/api';
import { LARGO_MINIMO_PASSWORD, validarPassword } from '@/lib/password';
import { useSesionStore, type Sesion } from '@/stores/sesion';

const route = useRoute();
const router = useRouter();
const sesion = useSesionStore();

// Igual que en el reset: el token viene del enlace del correo
// (config.appBaseUrl + '/accept-invitation?token=…').
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''));

const nombre = ref('');
const password = ref('');
const confirmacion = ref('');
const verPassword = ref(false);
const enviando = ref(false);
const error = ref('');

async function handleSubmit() {
	if (enviando.value) return;

	const problema = validarPassword(password.value, confirmacion.value);
	if (problema) {
		error.value = problema;
		return;
	}

	enviando.value = true;
	error.value = '';

	try {
		// Este endpoint devuelve una sesión ya iniciada, así que no hay que pasar
		// por el login: se aplica y se entra directo. Sin "mantener sesión
		// iniciada" (false), que es lo prudente en un enlace que puede abrirse en
		// un ordenador prestado; quien quiera recordarla lo marca al volver.
		const nueva = await peticionPublica<Sesion>('/api/auth/invitations/accept', {
			cuerpo: { token: token.value, nombre: nombre.value.trim(), password: password.value },
		});
		sesion.aplicar(nueva, false);
		router.replace('/overview');
	} catch (fallo) {
		error.value = mensajeDeError(fallo, {
			400: 'La invitación ya no sirve: o caducó o ya se aceptó. Pedile a quien te invitó que te la reenvíe.',
			409: 'Esa cuenta ya pertenece a otro cliente. Hablá con quien te invitó.',
			429: 'Demasiados intentos. Esperá unos minutos antes de volver a probar.',
		});
	} finally {
		enviando.value = false;
	}
}
</script>

<template>
	<AuthShell v-if="!token" titulo="Enlace incompleto">
		<div class="auth-form">
			<p class="auth-alert auth-alert-error" role="alert">
				<i class="ki-filled ki-information-2" />
				<span>Este enlace de invitación no trae el código de verificación. Puede que tu cliente de correo lo haya recortado: probá copiándolo entero, o pedile a quien te invitó que te lo reenvíe.</span>
			</p>
			<RouterLink class="kt-btn kt-btn-primary auth-submit" to="/sign-in">Ir a iniciar sesión</RouterLink>
		</div>
	</AuthShell>

	<AuthShell v-else titulo="Creá tu cuenta" subtitulo="Elegí cómo te llamás y una contraseña para entrar">
		<form class="auth-form" @submit.prevent="handleSubmit">
			<p v-if="error" class="auth-alert auth-alert-error" role="alert">
				<i class="ki-filled ki-information-2" /><span>{{ error }}</span>
			</p>

			<div class="auth-field">
				<label class="kt-form-label font-normal text-mono">Nombre y apellido</label>
				<input v-model="nombre" class="kt-input" type="text" placeholder="Ana Gómez" autocomplete="name" maxlength="200" :disabled="enviando" required />
			</div>

			<div class="auth-field">
				<label class="kt-form-label font-normal text-mono">Contraseña</label>
				<div class="kt-input">
					<input v-model="password" :type="verPassword ? 'text' : 'password'" placeholder="Al menos 12 caracteres" autocomplete="new-password" :disabled="enviando" required />
					<button class="kt-btn kt-btn-sm kt-btn-ghost kt-btn-icon" type="button" :aria-label="verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'" @click="verPassword = !verPassword">
						<i class="ki-filled" :class="verPassword ? 'ki-eye-slash' : 'ki-eye'" />
					</button>
				</div>
				<small class="auth-ayuda">Mínimo {{ LARGO_MINIMO_PASSWORD }} caracteres. Una frase larga es mejor que un lío corto de símbolos.</small>
			</div>

			<div class="auth-field">
				<label class="kt-form-label font-normal text-mono">Repetí la contraseña</label>
				<input v-model="confirmacion" class="kt-input" :type="verPassword ? 'text' : 'password'" placeholder="Escribila otra vez" autocomplete="new-password" :disabled="enviando" required />
			</div>

			<button class="kt-btn kt-btn-primary auth-submit" type="submit" :disabled="enviando">
				{{ enviando ? 'Creando la cuenta…' : 'Crear cuenta y entrar' }}
			</button>
		</form>
	</AuthShell>
</template>
