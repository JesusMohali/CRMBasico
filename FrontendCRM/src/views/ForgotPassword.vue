<script setup lang="ts">
import { ref } from 'vue';
import AuthShell from '@/components/auth/AuthShell.vue';
import { mensajeDeError, peticionPublica } from '@/lib/api';

const email = ref('');
const enviando = ref(false);
const enviado = ref(false);
const error = ref('');

async function handleSubmit() {
	if (enviando.value) return;
	enviando.value = true;
	error.value = '';

	try {
		await peticionPublica('/api/auth/password/forgot', { cuerpo: { email: email.value.trim() } });
		enviado.value = true;
	} catch (fallo) {
		error.value = mensajeDeError(fallo, {
			429: 'Pediste el enlace demasiadas veces. Esperá unos minutos antes de volver a probar.',
		});
	} finally {
		enviando.value = false;
	}
}
</script>

<template>
	<AuthShell
		titulo="Recuperá tu contraseña"
		:subtitulo="enviado ? undefined : 'Te mandamos un enlace para elegir una nueva'">
		<!--
			El backend responde 202 exista o no el email, para que este formulario no
			sirva de listado de cuentas registradas. El mensaje de éxito repite esa
			ambigüedad a propósito: no puede decir 'te lo mandamos' porque no lo sabe.
		-->
		<div v-if="enviado" class="auth-form">
			<p class="auth-alert auth-alert-ok" role="status">
				<i class="ki-filled ki-check-circle" />
				<span>Si ese correo tiene una cuenta, en unos minutos te llega un enlace para cambiar la contraseña. Revisá también la carpeta de spam.</span>
			</p>
			<RouterLink class="kt-btn kt-btn-primary auth-submit" to="/sign-in">Volver a iniciar sesión</RouterLink>
		</div>

		<form v-else class="auth-form" @submit.prevent="handleSubmit">
			<p v-if="error" class="auth-alert auth-alert-error" role="alert">
				<i class="ki-filled ki-information-2" /><span>{{ error }}</span>
			</p>

			<div class="auth-field">
				<label class="kt-form-label font-normal text-mono">Correo</label>
				<input v-model="email" class="kt-input" type="email" placeholder="nombre@empresa.com" autocomplete="email" :disabled="enviando" required />
			</div>

			<button class="kt-btn kt-btn-primary auth-submit" type="submit" :disabled="enviando">
				{{ enviando ? 'Enviando…' : 'Enviarme el enlace' }}
			</button>

			<p class="auth-pie">
				<RouterLink class="kt-link" to="/sign-in">Volver a iniciar sesión</RouterLink>
			</p>
		</form>
	</AuthShell>
</template>
