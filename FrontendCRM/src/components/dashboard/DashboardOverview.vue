<template>
	<div class="dashboard">
		<section class="page-toolbar">
			<div>
				<h1>Dashboard</h1>
				<p><a href="#">Home</a></p>
			</div>
			<div class="toolbar-actions">
				<DateRangePicker
					v-if="dashboard.period === 'Personalizado'"
					:from="dashboard.customFrom"
					:to="dashboard.customTo"
					@update:from="dashboard.customFrom = $event"
					@update:to="dashboard.customTo = $event" />
				<div ref="periodMenu" class="kt-menu date-menu">
					<button class="kt-btn kt-btn-outline date-toggle" type="button" :aria-expanded="periodMenuOpen" @click.stop="periodMenuOpen = !periodMenuOpen">
						<i class="ki-filled ki-calendar" /><span>{{ dashboard.period }}</span
						><i class="ki-filled ki-down" />
					</button>
					<Transition name="menu-pop">
						<div v-if="periodMenuOpen" class="kt-menu-dropdown date-dropdown">
							<button
								v-for="item in PERIODS"
								:key="item"
								class="date-option"
								:class="{ active: dashboard.period === item }"
								type="button"
								@click="
									dashboard.setPeriod(item);
									periodMenuOpen = false;
								">
								{{ item }}
							</button>
						</div>
					</Transition>
				</div>
			</div>
		</section>
		<section>
			<CardInfo />
		</section>
		<section class="bottom-grid">
			<TeamsTable />
			<LeadsPhaseChart />
		</section>
	</div>
</template>
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import TeamsTable from './TeamsTable.vue'
import CardInfo from './CardInfo.vue'
import LeadsPhaseChart from './LeadsPhaseChart.vue'
import DateRangePicker from './DateRangePicker.vue'
import { PERIODS, useDashboardStore } from '../../stores'
const dashboard = useDashboardStore();
const periodMenuOpen = ref(false)
const periodMenu = ref<HTMLElement>()
function closePeriodMenu(event: MouseEvent) {
	if (periodMenu.value && !periodMenu.value.contains(event.target as Node)) periodMenuOpen.value = false;
}
onMounted(() => document.addEventListener('click', closePeriodMenu));
onBeforeUnmount(() => document.removeEventListener('click', closePeriodMenu));
</script>
