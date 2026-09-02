<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import logo from '@/assets/media/app/peak-logo.png';

const router = useRouter();
const email = ref('');
const password = ref('');
const showPassword = ref(false);
const keepLoggedIn = ref(false);

function handleSubmit() {
	// Todavía no hay backend de autenticación. Cuando lo haya, acá va
	// la llamada real (por ej. POST /auth/login) y el guardado de la
	// sesión antes de navegar — por ahora solo entra al dashboard.
	router.push('/overview');
}
</script>

<template>
	<div class="auth-shell dark">
		<section class="auth-form-side">
			<div class="auth-form-wrap">
				<div class="auth-brand-mobile"><img :src="logo" alt="Peak Intelligence" /><strong>Peak Intelligence</strong></div>

				<div class="auth-heading">
					<h1>¡Bienvenido a Peak Intelligence!</h1>
					<p>Iniciá sesión con tu correo y contraseña</p>
				</div>

				<form class="auth-form" @submit.prevent="handleSubmit">
					<div class="auth-field">
						<label class="kt-form-label font-normal text-mono">Correo</label>
						<input v-model="email" class="kt-input" type="email" placeholder="nombre@empresa.com" required />
					</div>

					<div class="auth-field">
						<div class="auth-field-head">
							<label class="kt-form-label font-normal text-mono">Contraseña</label>
							<RouterLink class="kt-link" to="#">¿Olvidaste tu contraseña?</RouterLink>
						</div>
						<div class="kt-input">
							<input v-model="password" :type="showPassword ? 'text' : 'password'" placeholder="Ingresá tu contraseña" required />
							<button class="kt-btn kt-btn-sm kt-btn-ghost kt-btn-icon" type="button" @click="showPassword = !showPassword">
								<i class="ki-filled" :class="showPassword ? 'ki-eye-slash' : 'ki-eye'" />
							</button>
						</div>
					</div>

					<label class="kt-label">
						<input v-model="keepLoggedIn" class="kt-checkbox kt-checkbox-sm" type="checkbox" />
						<span class="kt-checkbox-label">Mantener sesión iniciada</span>
					</label>

					<button class="kt-btn kt-btn-primary auth-submit" type="submit">Iniciar sesión</button>
				</form>
			</div>
		</section>

		<aside class="auth-brand-side">
			<img :src="logo" alt="Peak Intelligence" class="auth-brand-image" />
			<div class="auth-brand-scrim">
				<!-- <div class="auth-brand-content">
					<h2>Peak Intelligence</h2>
					<p>CRM y panel de analítica para tu embudo de ventas</p>
				</div> -->
			</div>
		</aside>
	</div>
</template>
