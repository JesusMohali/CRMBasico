<script setup lang="ts">
/**
 * Marco común de las pantallas sin sidebar (login, recuperación, invitación).
 * Existe para que las cuatro compartan el mismo maquetado de verdad y no por
 * copiarlo: si mañana cambia la imagen de marca, cambia en un sitio.
 */
import logo from '@/assets/media/app/peak-logo.png';

defineProps<{
	titulo: string;
	subtitulo?: string;
}>();
</script>

<template>
	<div class="auth-shell dark">
		<section class="auth-form-side">
			<div class="auth-form-wrap">
				<div class="auth-brand-mobile"><img :src="logo" alt="Peak Intelligence" /><strong>Peak Intelligence</strong></div>

				<div class="auth-heading">
					<h1>{{ titulo }}</h1>
					<p v-if="subtitulo">{{ subtitulo }}</p>
				</div>

				<slot />
			</div>
		</section>

		<aside class="auth-brand-side">
			<img :src="logo" alt="Peak Intelligence" class="auth-brand-image" />
			<div class="auth-brand-scrim" />
		</aside>
	</div>
</template>
