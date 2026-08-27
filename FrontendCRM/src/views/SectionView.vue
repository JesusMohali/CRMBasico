<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
	<section class="dashboard page-view">
		<section class="page-toolbar">
			<div>
				<h1>{{ title }}</h1>
				<p><RouterLink to="/overview">Home</RouterLink> / {{ title }}</p>
			</div>
		</section>
		<section class="kt-card page-placeholder">
			<h2>{{ title }}</h2>
			<p>This page is ready for its content.</p>
		</section>
	</section>
</template>
