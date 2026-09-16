<script setup lang="ts">
/**
 * Marco común de las pantallas sin sidebar (login, recuperación, invitación).
 * Existe para que las cuatro compartan el mismo maquetado de verdad y no por
 * copiarlo: si mañana cambia la imagen de marca, cambia en un sitio.
 */
const logo = '/favicon_io/android-chrome-512x512.png';

defineProps<{
	titulo: string;
	subtitulo?: string;
}>();
</script>

<template>
	<div class="auth-shell dark">
		<section class="auth-form-side">
			<div class="auth-form-wrap">
				<div class="auth-brand-mobile"><img :src="logo" alt="Agent IA" /><strong>Agent IA</strong></div>

				<div class="auth-heading">
					<h1>{{ titulo }}</h1>
					<p v-if="subtitulo">{{ subtitulo }}</p>
				</div>

				<slot />
			</div>
		</section>

		<aside class="auth-brand-side">
			<img :src="logo" alt="Agent IA" class="auth-brand-image" />
			<div class="auth-brand-scrim" />
		</aside>
	</div>
</template>
