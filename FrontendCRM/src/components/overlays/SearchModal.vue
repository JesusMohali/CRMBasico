<script setup lang="ts">
import { ref } from 'vue';
import { useUiStore } from '../../stores';
const ui = useUiStore();
const query = ref('');
</script>
<template>
	<div class="overlay" @click.self="ui.searchOpen = false">
		<div class="modal kt-modal">
			<div class="modal-head">
				<h2>Search</h2>
				<button class="icon-btn" @click="ui.searchOpen = false">×</button>
			</div>
			<label class="modal-search">⌕<input v-model="query" autofocus placeholder="Search anything..." /></label>
			<div v-if="query" class="search-result">
				<span>⌁</span>
				<div>
					<b>Search results for “{{ query }}”</b><small>Press enter to open the result</small>
				</div>
			</div>
			<p v-else class="empty-state">Type to search across your workspace</p>
		</div>
	</div>
</template>
