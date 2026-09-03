<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Calendar, type FormatDateString, type Options } from 'vanilla-calendar-pro';

const props = defineProps<{ from: string; to: string }>();
const emit = defineEmits<{ 'update:from': [string]; 'update:to': [string] }>();

const open = ref(false)
const root = ref<HTMLElement>()
const calendarHost = ref<HTMLElement>()
let calendar: Calendar | undefined

function initCalendar() {
	if (!calendarHost.value) return;
	const initialDates = props.from && props.to ? [props.from, props.to] : props.from ? [props.from] : [];
	const isDarkMode = document.documentElement.classList.contains('dark');

	const options: Partial<Options> = {
		type: 'multiple',
		selectionDatesMode: 'multiple-ranged',
		displayMonthsCount: 2,
		firstWeekday: 1,
		locale: 'es',
		displayDateMax: new Date,
		selectedDates: initialDates,
		selectedTheme: isDarkMode ? 'dark' : 'light',
		onClickDate(self) {
			const dates = self.context.selectedDates;
			const from = dates[0] ?? '';
			const to = dates.length > 1 ? dates[dates.length - 1] : '';
			emit('update:from', from);
			emit('update:to', to);
		},
	};

	// La librería acepta la referencia del elemento directamente (patrón
	// oficial de su propia guía de integración con Vue) — no hace falta
	// armar un id + selector de texto.
	calendar = new Calendar(calendarHost.value, options);
	calendar.init();
}

const triggerLabel = computed(() => {
	if (!props.from) return 'Elegir fechas';
	const short = (iso: string) => {
		const [y, m, d] = iso.split('-');
		return `${d}/${m}/${y}`;
	};
	return props.to ? `${short(props.from)} – ${short(props.to)}` : `${short(props.from)} – …`;
});

function closeOnOutsideClick(event: MouseEvent) {
	if (root.value && !root.value.contains(event.target as Node)) open.value = false;
}

watch(open, (isOpen) => {
	calendar?.destroy();
	calendar = undefined;
	if (isOpen) nextTick(initCalendar);
});

onMounted(() => document.addEventListener('click', closeOnOutsideClick));
onBeforeUnmount(() => {
	document.removeEventListener('click', closeOnOutsideClick);
	calendar?.destroy();
});
</script>

<template>
	<div ref="root" class="kt-menu date-menu range-picker">
		<button class="kt-btn kt-btn-outline date-toggle" type="button" :aria-expanded="open" @click.stop="open = !open">
			<i class="ki-filled ki-calendar" /><span>{{ triggerLabel }}</span
			><i class="ki-filled ki-down" />
		</button>
		<Transition name="menu-pop">
			<div v-if="open" class="kt-menu-dropdown date-dropdown range-dropdown">
				<div ref="calendarHost" />
			</div>
		</Transition>
	</div>
</template>
