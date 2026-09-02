<script setup lang="ts">
import { useRouter } from 'vue-router';
defineProps<{ title: string }>();
const router = useRouter();
</script>

<template>
	<section class="dashboard page-view">
		<section class="page-toolbar">
			<div class="page-heading">
				<!-- <button class="icon-btn" type="button" title="Volver" @click="router.back()"><i class="ki-filled ki-black-left-line" /></button> -->
				<div>
					<h1>{{ title }}</h1>
					<p><RouterLink to="/overview">Home</RouterLink> / {{ title }}</p>
				</div>
			</div>
		</section>
		<section class="kt-card page-placeholder">
			<h2>{{ title }}</h2>
			<p>This page is ready for its content.</p>
		</section>
	</section>
</template>
