<script setup lang="ts">
defineProps<{ label: string; active: boolean; direction: 'asc' | 'desc' }>();
const emit = defineEmits<{ sort: [] }>();
</script>

<template>
	<th
		class="sortable-col"
		:aria-sort="active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'"
		@click="emit('sort')">
		<span class="sortable-col-inner">
			<span>{{ label }}</span>
			<span class="sort-indicator">
				<i class="ki-filled ki-up" :class="{ active: active && direction === 'asc' }" />
				<i class="ki-filled ki-down" :class="{ active: active && direction === 'desc' }" />
			</span>
		</span>
	</th>
</template>
