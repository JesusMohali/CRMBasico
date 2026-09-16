<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { useConfirmStore } from '../../stores';

const confirmStore = useConfirmStore();

function onKeydown(event: KeyboardEvent) {
	if (!confirmStore.open) return;
	if (event.key === 'Escape') confirmStore.resolve(false);
	if (event.key === 'Enter') confirmStore.resolve(true);
}
onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
	<Transition name="modal-pop">
		<div v-if="confirmStore.open" class="overlay" @click.self="confirmStore.resolve(false)">
			<div class="modal confirm-modal">
				<div v-if="confirmStore.title" class="modal-head">
					<h2>{{ confirmStore.title }}</h2>
				</div>
				<p class="confirm-body">{{ confirmStore.message }}</p>
				<div class="modal-foot">
					<button class="kt-btn kt-btn-secondary" type="button" autofocus @click="confirmStore.resolve(false)">{{ confirmStore.cancelText }}</button>
					<button class="kt-btn" :class="confirmStore.danger ? 'kt-btn-destructive' : 'kt-btn-primary'" type="button" @click="confirmStore.resolve(true)">{{ confirmStore.confirmText }}</button>
				</div>
			</div>
		</div>
	</Transition>
</template>