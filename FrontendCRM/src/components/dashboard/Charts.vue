<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import ApexCharts from 'apexcharts';
const props = defineProps<{ kind: string }>();
const host = ref<HTMLElement>();
let chart: ApexCharts | undefined;
const series = {
	Balance: [75, 25, 45, 15, 85, 35, 70, 25, 35],
	Earnings: [45, 35, 45, 35, 55, 85, 20, 25, 55],
	Orders: [25, 55, 65, 45, 25, 65, 50, 40, 60],
	uploads: [85, 65, 50, 70, 40, 45, 100, 55, 85, 60, 70, 90],
};
function render() {
	if (!host.value) return;
	chart?.destroy();
	const isDonut = props.kind === 'contributions';
	chart = new ApexCharts(host.value, {
		chart: { type: isDonut ? 'donut' : 'area', height: isDonut ? 230 : 210, toolbar: { show: false }, sparkline: { enabled: isDonut } },
		series: isDonut ? [44, 22, 17, 10, 7] : [{ name: props.kind, data: series[props.kind as keyof typeof series] || series.Balance }],
		labels: isDonut ? ['ERP', 'HRM', 'DMS', 'CRM', 'DAM'] : undefined,
		colors: isDonut ? ['#2f80ed', '#f04444', '#22c55e', '#8b5cf6', '#f59e0b'] : ['#2f80ed'],
		stroke: { curve: 'smooth', width: 3 },
		fill: { gradient: { enabled: true, opacityFrom: 0.25, opacityTo: 0 } },
		dataLabels: { enabled: false },
		legend: { show: isDonut, position: 'bottom', fontSize: '12px' },
		grid: { borderColor: 'var(--border)', strokeDashArray: 4 },
		xaxis: { categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'], labels: { style: { colors: 'var(--muted-foreground)' } } },
		yaxis: { labels: { style: { colors: 'var(--muted-foreground)' } } },
		tooltip: { theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light' },
	});
	chart.render();
}
onMounted(render);
watch(() => props.kind, render);
onBeforeUnmount(() => chart?.destroy());
</script>
<template><div ref="host" class="chart-host" /></template>
