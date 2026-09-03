<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import AuthShell from '@/components/auth/AuthShell.vue';
import { mensajeDeError, peticionPublica } from '@/lib/api';
import { LARGO_MINIMO_PASSWORD, validarPassword } from '@/lib/password';

const route = useRoute();

// El token llega en el enlace del correo que manda el backend
// (config.appBaseUrl + '/reset-password?token=…'). Se lee una sola vez: si el
// componente se re-renderizara con la query ya limpia seguiría teniéndolo.
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''));

const password = ref('');
const confirmacion = ref('');
const verPassword = ref(false);
const enviando = ref(false);
const listo = ref(false);
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
		await peticionPublica('/api/auth/password/reset', {
			cuerpo: { token: token.value, password: password.value },
		});
		listo.value = true;
	} catch (fallo) {
		// El backend devuelve 400 tanto para un token inventado como para uno ya
		// usado o caducado: no los distingue a propósito, así que aquí tampoco.
		error.value = mensajeDeError(fallo, {
			400: 'El enlace ya no sirve: o caducó o ya se usó. Pedí uno nuevo.',
			429: 'Demasiados intentos. Esperá unos minutos antes de volver a probar.',
		});
	} finally {
		enviando.value = false;
	}
}
</script>

<template>
	<!-- Sin token no hay nada que hacer, y es un caso real: pasa cuando el cliente
	     de correo recorta el enlace o alguien entra a /reset-password a mano. Vale
	     más decirlo claro que enseñar un formulario que va a fallar al enviarse. -->
	<AuthShell v-if="!token" titulo="Enlace incompleto">
		<div class="auth-form">
			<p class="auth-alert auth-alert-error" role="alert">
				<i class="ki-filled ki-information-2" />
				<span>Este enlace no trae el código de verificación. Puede que tu cliente de correo lo haya recortado: probá copiándolo entero, o pedí uno nuevo.</span>
			</p>
			<RouterLink class="kt-btn kt-btn-primary auth-submit" to="/forgot-password">Pedir un enlace nuevo</RouterLink>
		</div>
	</AuthShell>

	<AuthShell v-else-if="listo" titulo="Contraseña actualizada">
		<div class="auth-form">
			<p class="auth-alert auth-alert-ok" role="status">
				<i class="ki-filled ki-check-circle" />
				<span>Ya podés entrar con tu contraseña nueva. Por seguridad se cerraron todas las sesiones que tuvieras abiertas.</span>
			</p>
			<RouterLink class="kt-btn kt-btn-primary auth-submit" to="/sign-in">Iniciar sesión</RouterLink>
		</div>
	</AuthShell>

	<AuthShell v-else titulo="Elegí una contraseña nueva" subtitulo="Va a reemplazar a la anterior en todos tus dispositivos">
		<form class="auth-form" @submit.prevent="handleSubmit">
			<p v-if="error" class="auth-alert auth-alert-error" role="alert">
				<i class="ki-filled ki-information-2" /><span>{{ error }}</span>
			</p>

			<div class="auth-field">
				<label class="kt-form-label font-normal text-mono">Contraseña nueva</label>
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
				{{ enviando ? 'Guardando…' : 'Guardar contraseña' }}
			</button>

			<p class="auth-pie">
				<RouterLink class="kt-link" to="/sign-in">Volver a iniciar sesión</RouterLink>
			</p>
		</form>
	</AuthShell>
</template>
