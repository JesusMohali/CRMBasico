<script setup lang="ts">
import { useUiStore } from '../../stores';
import { useSesionStore } from '../../stores/sesion';
const ui = useUiStore();
const sesion = useSesionStore();
</script>
<template>
	<div class="overlay" @click.self="ui.profileOpen = false">
		<div class="modal profile-modal">
			<div class="profile-banner"><span class="avatar avatar-large avatar-green">{{ sesion.iniciales }}</span><button class="icon-btn" @click="ui.profileOpen = false">×</button></div>
			<div class="profile-content">
				<h2>{{ sesion.usuario?.nombre ?? 'Sin sesión' }}</h2>
				<p>{{ sesion.usuario?.email ?? '' }}<template v-if="sesion.tenant"> · {{ sesion.etiquetaRol }} en {{ sesion.tenant.nombre }}</template></p>
				<button class="kt-btn kt-btn-primary" @click="ui.profileOpen = false">Edit profile</button>
			</div>
		</div>
	</div>
</template>
