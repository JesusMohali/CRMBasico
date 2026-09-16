<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
// import { useRouter } from 'vue-router';
import ApexCharts from 'apexcharts';
import { useFinanceStore, useDashboardStore, formatMoneda, formatPorcentaje } from '../stores';
import SortableTh from '../components/common/SortableTh.vue';

// const router = useRouter();
const finance = useFinanceStore();
const dashboard = useDashboardStore();

const host = ref<HTMLElement>();
let chart: ApexCharts | undefined;

function render() {
	if (!host.value) return;
	chart?.destroy();
	const isDark = document.documentElement.classList.contains('dark');
	chart = new ApexCharts(host.value, {
		chart: { type: 'bar', height: 320, toolbar: { show: false }, stacked: true },
		series: [
			{ name: 'Gasto', data: finance.allMonths.map((m) => m.gasto) },
			{ name: 'Beneficio', data: finance.allMonths.map((m) => m.beneficio) },
		],
		colors: ['#e9a11b', '#22c55e'],
		plotOptions: { bar: { columnWidth: '55%', borderRadius: 3 } },
		dataLabels: { enabled: false },
		xaxis: { categories: finance.allMonths.map((m) => m.label), labels: { style: { colors: 'var(--muted-foreground)' } } },
		yaxis: { labels: { style: { colors: 'var(--muted-foreground)' }, formatter: (value: number) => formatMoneda(value) } },
		grid: { borderColor: 'var(--border)', strokeDashArray: 4 },
		legend: { show: true, position: 'top', horizontalAlign: 'right', labels: { colors: 'var(--text)' } },
		tooltip: { theme: isDark ? 'dark' : 'light', y: { formatter: (value: number) => formatMoneda(value) } },
		// El total (gasto + beneficio = facturación) va como anotación
		// arriba de cada barra — no es una serie más, es la suma de las
		// dos que ya están apiladas.
		annotations: {
			points: finance.allMonths.map((m) => ({
				x: m.label,
				y: m.facturacion,
				label: {
					text: formatMoneda(m.facturacion),
					borderWidth: 0,
					offsetY: -6,
					style: { color: 'var(--muted-foreground)', background: 'transparent', fontSize: '10px', fontWeight: '700' },
				},
			})),
		},
	});
	chart.render();
}

onMounted(render);
watch(() => finance.allMonths, render, { deep: true });
onBeforeUnmount(() => chart?.destroy());

// ── Gasto de {mes} por etiqueta — gráfico de barras horizontal ─────
// Elegí barras horizontales en vez de dona: con etiquetas que el
// usuario puede seguir agregando con el tiempo, un ranking horizontal
// se lee mejor que una dona (que se satura con más de 5-6 porciones).
const expenseHost = ref<HTMLElement>();
let expenseChart: ApexCharts | undefined;

const TAG_COLORS = ['#635bff', '#2b91e8', '#e9a11b', '#10a7a7', '#ef4444', '#8b5cf6', '#22c55e'];

const sortedExpenses = computed(() => [...finance.expenses].sort((a, b) => b.amount - a.amount));

function renderExpenseChart() {
	if (!expenseHost.value) return;
	expenseChart?.destroy();
	const isDark = document.documentElement.classList.contains('dark');
	const items = sortedExpenses.value;
	expenseChart = new ApexCharts(expenseHost.value, {
		chart: { type: 'bar', height: Math.max(180, items.length * 46), toolbar: { show: false } },
		series: [{ name: 'Gasto', data: items.map((item) => item.amount) }],
		colors: items.map((_, index) => TAG_COLORS[index % TAG_COLORS.length]),
		plotOptions: { bar: { horizontal: true, borderRadius: 4, distributed: true, barHeight: '55%' } },
		dataLabels: { enabled: true, formatter: (value: number) => formatMoneda(value), style: { colors: ['var(--text)'], fontSize: '11px' }, offsetX: 6 },
		legend: { show: false },
		xaxis: { categories: items.map((item) => item.tag), labels: { style: { colors: 'var(--muted-foreground)' }, formatter: (value: string) => formatMoneda(Number(value)) } },
		yaxis: { labels: { style: { colors: 'var(--text)' } } },
		grid: { borderColor: 'var(--border)', strokeDashArray: 4 },
		tooltip: { theme: isDark ? 'dark' : 'light', y: { formatter: (value: number) => formatMoneda(value) } },
	});
	expenseChart.render();
}

onMounted(renderExpenseChart);
watch(() => finance.expenses, renderExpenseChart, { deep: true });
onBeforeUnmount(() => expenseChart?.destroy());

const newExpenseTag = ref('');
const newExpenseAmount = ref<number | null>(null);

function submitExpense() {
	if (!newExpenseTag.value.trim() || !newExpenseAmount.value) return;
	finance.addExpense(newExpenseTag.value, newExpenseAmount.value);
	newExpenseTag.value = '';
	newExpenseAmount.value = null;
}

// ── Lectura automática ─────────────────────────────────────────────
const firstMonth = computed(() => finance.allMonths[0]);
const lastMonth = computed(() => finance.allMonths[finance.allMonths.length - 1]);
const growthFacturacion = computed(() => (firstMonth.value.facturacion ? (lastMonth.value.facturacion - firstMonth.value.facturacion) / firstMonth.value.facturacion : 0));
const growthGasto = computed(() => (firstMonth.value.gasto ? (lastMonth.value.gasto - firstMonth.value.gasto) / firstMonth.value.gasto : 0));
const marginFirst = computed(() => (firstMonth.value.facturacion ? firstMonth.value.beneficio / firstMonth.value.facturacion : 0));
const marginLast = computed(() => (lastMonth.value.facturacion ? lastMonth.value.beneficio / lastMonth.value.facturacion : 0));

const oportunidadesWidget = computed(() => dashboard.widgets.find((widget) => widget.key === 'oportunidades'));
const ratioAgendaWidget = computed(() => dashboard.widgets.find((widget) => widget.key === 'ratioAgenda'));

const readingParagraphs = computed(() => {
	if (finance.readingStage !== 'completa') return [];
	const paragraphs: string[] = [];

	paragraphs.push(
		`En los últimos ${finance.closedMonthsCount} meses tu facturación ha crecido un ${formatPorcentaje(growthFacturacion.value)} (${formatMoneda(firstMonth.value.facturacion)} → ${formatMoneda(lastMonth.value.facturacion)}), pero tus gastos han subido un ${formatPorcentaje(growthGasto.value)} (${formatMoneda(firstMonth.value.gasto)} → ${formatMoneda(lastMonth.value.gasto)}). El margen pasó del ${formatPorcentaje(marginFirst.value)} al ${formatPorcentaje(marginLast.value)}.`
	);

	if (finance.seasonalDips.length) {
		const dipsText = finance.seasonalDips.map((dip) => `${dip.month} (${formatPorcentaje(dip.drop)} frente a ${dip.vsMonth})`).join(' y ');
		paragraphs.push(`Tenés un patrón estacional claro: ${dipsText} son meses más flojos, y conviene planificar caja y campañas contando con ello.`);
	}

	paragraphs.push(`Tu mejor mes fue ${finance.maxMonth.label} (${formatMoneda(finance.maxMonth.facturacion)} y ${formatMoneda(finance.maxMonth.beneficio)} de beneficio).`);

	if (oportunidadesWidget.value && ratioAgendaWidget.value) {
		paragraphs.push(`Si sostenés el ratio de agenda actual del ${ratioAgendaWidget.value.valueLabel}, el pipeline abierto proyecta ${oportunidadesWidget.value.valueLabel} para el próximo cierre.`);
	}

	return paragraphs;
});
</script>

<template>
	<section class="dashboard page-view">
		<header class="page-toolbar">
			<!--
			<div class="page-heading">
				<button class="icon-btn" type="button" title="Volver" @click="router.back()"><i class="ki-filled ki-black-left-line" /></button>
				<div>
					<h1>Finanzas</h1>
					<p><RouterLink to="/overview">Home</RouterLink> / Finanzas</p>
				</div>
			</div>
			-->
			<div>
				<h1>Finanzas</h1>
				<p><RouterLink to="/overview">Home</RouterLink> / Finanzas</p>
			</div>
		</header>

		<section class="status-summary">
			<div class="status-pill"><span>Mes más bajo</span><b>{{ finance.minMonth.label }} · {{ formatMoneda(finance.minMonth.facturacion) }}</b></div>
			<div class="status-pill"><span>Mes más alto</span><b>{{ finance.maxMonth.label }} · {{ formatMoneda(finance.maxMonth.facturacion) }}</b></div>
			<div class="status-pill"><span>{{ finance.currentMonthLabel }} (mes actual)</span><b>{{ formatMoneda(finance.currentMonthFacturacion) }}</b></div>
		</section>

		<section class="kt-card">
			<div class="card-head">
				<div>
					<h2>Facturación, gasto y beneficio</h2>
					<p>La altura total de cada barra es la facturación del mes — arriba, el total</p>
				</div>
			</div>
			<div ref="host" />
		</section>

		<section class="kt-card">
			<div class="card-head">
				<div>
					<h2>Gasto de {{ finance.currentMonthLabel }} por etiqueta</h2>
					<p>Total: {{ formatMoneda(finance.currentMonthGasto) }} · Beneficio del mes: {{ formatMoneda(finance.currentMonthBeneficio) }}</p>
				</div>
			</div>
			<div class="finance-expense-grid">
				<div class="table-wrap compact-table">
					<table class="kt-table">
						<thead>
							<tr>
								<SortableTh label="Etiqueta" :active="finance.expenseSortKey === 'tag'" :direction="finance.expenseSortDir" @sort="finance.setExpenseSort('tag')" />
								<SortableTh label="Monto" :active="finance.expenseSortKey === 'amount'" :direction="finance.expenseSortDir" @sort="finance.setExpenseSort('amount')" />
								<th>%</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="item in finance.sortedExpenses" :key="item.id">
								<td>{{ item.tag }}</td>
								<td>{{ formatMoneda(item.amount) }}</td>
								<td>{{ finance.currentMonthGasto ? formatPorcentaje(item.amount / finance.currentMonthGasto) : '—' }}</td>
								<td><button class="icon-btn" type="button" title="Quitar gasto" @click="finance.removeExpense(item.id)"><i class="ki-filled ki-trash" /></button></td>
							</tr>
						</tbody>
					</table>
					<form class="expense-form" @submit.prevent="submitExpense">
						<input v-model="newExpenseTag" placeholder="Etiqueta (ej. Publicidad)" list="expense-tags" />
						<datalist id="expense-tags">
							<option v-for="item in finance.expenses" :key="item.id" :value="item.tag" />
						</datalist>
						<input v-model.number="newExpenseAmount" type="number" min="0" step="1" placeholder="Monto (€)" />
						<button class="kt-btn kt-btn-secondary" type="submit"><i class="ki-filled ki-plus" /> Añadir</button>
					</form>
					<p class="expense-hint">Si la etiqueta ya existe, el monto se suma a esa fila en vez de crear una nueva.</p>
				</div>
				<div ref="expenseHost" class="expense-chart-host" />
			</div>
		</section>

		<section class="kt-card insight-card" :class="finance.readingStage === 'completa' ? 'positive' : 'warning'">
			<i class="ki-filled" :class="finance.readingStage === 'completa' ? 'ki-abstract-41' : 'ki-information-2'" />
			<div>
				<p class="insight-title">Lectura automática · {{ finance.currentMonthLabel }} <span class="insight-tag">generada por reglas — placeholder de IA</span></p>
				<template v-if="finance.readingStage === 'completa'">
					<p v-for="(paragraph, index) in readingParagraphs" :key="index">{{ paragraph }}</p>
				</template>
				<p v-else-if="finance.readingStage === 'basica'">Con {{ finance.closedMonthsCount }} meses cerrados ya hay lectura básica de variaciones y margen. Faltan {{ 6 - finance.closedMonthsCount }} meses más para la lectura completa (estacionalidad y proyección).</p>
				<p v-else>Todavía faltan {{ 3 - finance.closedMonthsCount }} meses cerrados para la primera lectura automática.</p>
			</div>
		</section>
	</section>
</template>