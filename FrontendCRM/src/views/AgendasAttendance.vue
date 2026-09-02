<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
// import { useRouter } from 'vue-router';
import ApexCharts from 'apexcharts';
import { useAppointmentsStore, useDashboardStore, formatPorcentaje } from '../stores';

// const router = useRouter();
const appointments = useAppointmentsStore();
const dashboard = useDashboardStore();

const host = ref<HTMLElement>();
let chart: ApexCharts | undefined;

function render() {
	if (!host.value) return;
	chart?.destroy();
	const isDark = document.documentElement.classList.contains('dark');
	chart = new ApexCharts(host.value, {
		chart: { type: 'bar', height: 280, toolbar: { show: false }, stacked: true },
		series: [
			{ name: 'Show', data: appointments.byWeekday.map((item) => item.show) },
			{ name: 'No-show', data: appointments.byWeekday.map((item) => item.noShow) },
		],
		colors: ['#10a7a7', '#ef4444'],
		plotOptions: { bar: { columnWidth: '55%', borderRadius: 4 } },
		dataLabels: {
			enabled: false, 
			total: {
				enabled: true,
				style: {
					fontSize: '13px',
					fontWeight: 900,
				},
			},
		},
		xaxis: { categories: appointments.byWeekday.map((item) => item.day), labels: { style: { colors: 'var(--muted-foreground)' } } },
		yaxis: { labels: { style: { colors: 'var(--muted-foreground)' } }, forceNiceScale: true },
		grid: { borderColor: 'var(--border)', strokeDashArray: 4 },
		legend: { show: true, position: 'top', horizontalAlign: 'right', labels: { colors: 'var(--text)' } },
		tooltip: { theme: isDark ? 'dark' : 'light' },
	});
	chart.render();
}

onMounted(render);
watch(() => appointments.byWeekday, render, { deep: true });
onBeforeUnmount(() => chart?.destroy());

// Umbral ilustrativo: por debajo de 60 % de show se considera bajo,
// siguiendo el ejemplo del propio brief del cliente. El ratio de
// agenda lo toma del mismo store del dashboard (ya calculado ahí, no
// se repite la cuenta), respetando el periodo activo. El texto sale
// escrito acá según esta regla — no lo redacta ninguna IA.
const ratioAgendaLabel = computed(() => dashboard.widgets.find((widget) => widget.key === 'ratioAgenda')?.valueLabel ?? '—');

const insight = computed(() => {
	if (appointments.showRate < 0.6) {
		return {
			tone: 'warning',
			text: `La tasa de show es de ${formatPorcentaje(appointments.showRate)}, por debajo del 60 %, mientras el ratio conversación → agenda está en ${ratioAgendaLabel.value}. No es necesariamente un problema de volumen ni del closer: si el ratio de agenda es alto y el show es bajo, el prompt del setter está agendando demasiado pronto. Conviene que indague más en el dolor antes de proponer la llamada.`,
		};
	}
	return {
		tone: 'positive',
		text: `La tasa de show se mantiene saludable (${formatPorcentaje(appointments.showRate)}). No hay señales de que el setter esté agendando leads mal cualificados.`,
	};
});
</script>

<template>
	<section class="dashboard page-view">
		<header class="page-toolbar">
			<!--
			<div class="page-heading">
				<button class="icon-btn" type="button" title="Volver" @click="router.back()"><i class="ki-filled ki-black-left-line" /></button>
				<div>
					<h1>Agendas y asistencia</h1>
					<p><RouterLink to="/overview">Home</RouterLink> / Agendas</p>
				</div>
			</div>
			-->
			<div>
				<h1>Agendas y asistencia</h1>
				<p>
					<RouterLink to="/overview">Home</RouterLink> / Agendas
				</p>
			</div>
		</header>

		<section class="status-summary">
			<div class="status-pill">
				<span>Tasa de show</span><b>{{ formatPorcentaje(appointments.showRate) }}</b>
			</div>
			<div class="status-pill">
				<span>Tasa de no-show</span><b>{{ formatPorcentaje(appointments.noShowRate) }}</b>
			</div>
			<div class="status-pill">
				<span>Agendas con fecha pasada</span><b>{{ appointments.resolved.length }}</b>
			</div>
		</section>

		<section class="kt-card insight-card" :class="insight.tone">
			<i class="ki-filled" :class="insight.tone === 'warning' ? 'ki-information-2' : 'ki-check-circle'" />
			<p>{{ insight.text }}</p>
		</section>

		<section class="kt-card">
			<div class="card-head">
				<div>
					<h2>Show / no-show por día de la semana</h2>
					<p>Solo agendas con fecha pasada</p>
				</div>
			</div>
			<div ref="host" />
		</section>

		<section class="kt-card teams-card">
			<div class="card-head">
				<div>
					<h2>Por antelación del agendamiento</h2>
					<p>¿Agendar con más o menos anticipación cambia si la gente llega?</p>
				</div>
			</div>
			<div class="table-wrap">
				<table class="kt-table">
					<thead>
						<tr>
							<th>Antelación</th>
							<th>Agendas</th>
							<th>Show</th>
							<th>Tasa de show</th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="item in appointments.byLeadTime" :key="item.bucket">
							<td>{{ item.bucket }}</td>
							<td>{{ item.total }}</td>
							<td>{{ item.show }}</td>
							<td>{{ item.total ? formatPorcentaje(item.rate) : '—' }}</td>
						</tr>
					</tbody>
				</table>
			</div>
		</section>
	</section>
</template>
