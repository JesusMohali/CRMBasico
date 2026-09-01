<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps<{ from: string; to: string }>();
const emit = defineEmits<{ 'update:from': [string]; 'update:to': [string] }>();

const open = ref(false);
const root = ref<HTMLElement>();
const today = new Date();
const viewYear = ref(today.getFullYear());
const viewMonth = ref(today.getMonth());

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function toIso(date: Date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function fromIso(value: string) {
	if (!value) return null;
	const [y, m, d] = value.split('-').map(Number);
	return new Date(y, m - 1, d);
}

const monthLabel = computed(() => {
	const name = MONTH_NAMES[viewMonth.value];
	return `${name[0].toUpperCase()}${name.slice(1)} ${viewYear.value}`;
});

const days = computed(() => {
	const firstOfMonth = new Date(viewYear.value, viewMonth.value, 1);
	const startOffset = (firstOfMonth.getDay() + 6) % 7;
	const start = new Date(viewYear.value, viewMonth.value, 1 - startOffset);
	return Array.from({ length: 42 }, (_, i) => {
		const date = new Date(start);
		date.setDate(start.getDate() + i);
		return date;
	});
});

const fromDate = computed(() => fromIso(props.from));
const toDate = computed(() => fromIso(props.to));

function isSameDay(a: Date | null, b: Date | null) {
	return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isInRange(date: Date) {
	if (!fromDate.value || !toDate.value) return false;
	return date > fromDate.value && date < toDate.value;
}

function pickDay(date: Date) {
	if (!fromDate.value || (fromDate.value && toDate.value)) {
		emit('update:from', toIso(date));
		emit('update:to', '');
	} else if (date < fromDate.value) {
		emit('update:from', toIso(date));
		emit('update:to', '');
	} else {
		emit('update:to', toIso(date));
	}
}

function prevMonth() {
	if (viewMonth.value === 0) {
		viewMonth.value = 11;
		viewYear.value -= 1;
	} else {
		viewMonth.value -= 1;
	}
}

function nextMonth() {
	if (viewMonth.value === 11) {
		viewMonth.value = 0;
		viewYear.value += 1;
	} else {
		viewMonth.value += 1;
	}
}

const triggerLabel = computed(() => {
	if (!fromDate.value) return 'Elegir fechas';
	const format = (d: Date) => `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
	return toDate.value ? `${format(fromDate.value)} – ${format(toDate.value)}` : `${format(fromDate.value)} – …`;
});

function closeOnOutsideClick(event: MouseEvent) {
	if (root.value && !root.value.contains(event.target as Node)) open.value = false;
}

onMounted(() => document.addEventListener('click', closeOnOutsideClick));
onBeforeUnmount(() => document.removeEventListener('click', closeOnOutsideClick));
</script>

<template>
	<div ref="root" class="kt-menu date-menu range-picker">
		<button class="kt-btn kt-btn-outline date-toggle" type="button" :aria-expanded="open" @click.stop="open = !open">
			<i class="ki-filled ki-calendar" /><span>{{ triggerLabel }}</span
			><i class="ki-filled ki-down" />
		</button>
		<Transition name="menu-pop">
			<div v-if="open" class="kt-menu-dropdown date-dropdown range-dropdown">
				<div class="range-header">
					<button class="icon-btn" type="button" @click="prevMonth"><i class="ki-filled ki-left" /></button>
					<b>{{ monthLabel }}</b>
					<button class="icon-btn" type="button" @click="nextMonth"><i class="ki-filled ki-right" /></button>
				</div>
				<div class="range-weekdays"><span v-for="day in WEEKDAYS" :key="day">{{ day }}</span></div>
				<div class="range-grid">
					<button
						v-for="date in days"
						:key="date.toISOString()"
						type="button"
						class="range-day"
						:class="{
							outside: date.getMonth() !== viewMonth,
							selected: isSameDay(date, fromDate) || isSameDay(date, toDate),
							'in-range': isInRange(date),
						}"
						@click="pickDay(date)">
						{{ date.getDate() }}
					</button>
				</div>
			</div>
		</Transition>
	</div>
</template>
