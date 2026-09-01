<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import ApexCharts from 'apexcharts';
import { useTeamsStore } from '../../stores';
import { FASE_COLORS } from '../../constants/fases';

const teams = useTeamsStore();
const host = ref<HTMLElement>();
let chart: ApexCharts | undefined;

function render() {
	if (!host.value) return;
	chart?.destroy();
	const total = teams.byFase.reduce((sum, item) => sum + item.total, 0);
	const isDark = document.documentElement.classList.contains('dark');
	chart = new ApexCharts(host.value, {
		chart: { type: 'donut', height: 260, toolbar: { show: false } },
		series: teams.byFase.map((item) => item.total),
		labels: teams.byFase.map((item) => item.fase),
		colors: teams.byFase.map((item) => FASE_COLORS[item.fase]),
		dataLabels: { enabled: false },
		stroke: { width: 2, colors: [isDark ? '#101114' : '#fff'] },
		legend: { show: true, position: 'right', fontSize: '12px', markers: { size: 6 }, itemMargin: { vertical: 4 } },
		plotOptions: {
			pie: {
				donut: {
					size: '72%',
					labels: {
						show: true,
						total: { show: true, label: 'Leads', color: 'var(--muted-foreground)', formatter: () => String(total) },
						value: { color: 'var(--text)', fontSize: '22px', fontWeight: '700' },
					},
				},
			},
		},
		tooltip: { theme: isDark ? 'dark' : 'light' },
	});
	chart.render();
}

onMounted(render);
watch(() => teams.byFase, render, { deep: true });
onBeforeUnmount(() => chart?.destroy());
</script>

<template>
	<section class="kt-card phase-card">
		<div class="card-head">
			<div>
				<h2>Leads por fase</h2>
				<p>Distribución del embudo activo</p>
			</div>
		</div>
		<div ref="host" class="phase-chart-host" />
	</section>
</template>
