<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
// import { useRouter } from 'vue-router';
import { useDashboardStore, oportunidades, formatEntero, formatDecimal, formatPorcentaje, formatMoneda, type FunnelInputs } from '../stores';

// const router = useRouter();
const dashboard = useDashboardStore();
const baseline = computed(() => dashboard.currentFunnel);

// La cascada con los números reales del periodo activo — mismos
// factores que ya muestra el widget 3, solo que acá se ven las
// etapas intermedias. Las ventas esperadas se dejan con decimales a
// propósito (lo pide el PDF: es un valor esperado, no una cuenta de
// ventas reales).
const cascade = computed(() => {
	if (!baseline.value) return null;
	const conversaciones = baseline.value.conversaciones;
	const agendas = conversaciones * baseline.value.ratioAgenda;
	const shows = agendas * baseline.value.tasaShow;
	const ventas = shows * baseline.value.tasaCierre;
	const euros = ventas * baseline.value.ticketPromedio;
	return { conversaciones, agendas, shows, ventas, euros };
});

// ── Simulador ────────────────────────────────────────────────────
// Arranca en los valores reales del periodo activo y se puede mover
// libre desde ahí — no toca el dato real del dashboard, es una copia
// aparte. Los % de los sliders van en enteros (0-100) por comodidad
// del input range; se convierten a fracción recién al calcular.
const sim = reactive({ conversaciones: 0, ratioAgenda: 0, tasaShow: 0, tasaCierre: 0, ticketPromedio: 0 });

function resetToBaseline() {
	if (!baseline.value) return;
	sim.conversaciones = baseline.value.conversaciones;
	sim.ratioAgenda = Math.round(baseline.value.ratioAgenda * 100);
	sim.tasaShow = Math.round(baseline.value.tasaShow * 100);
	sim.tasaCierre = Math.round(baseline.value.tasaCierre * 100);
	sim.ticketPromedio = baseline.value.ticketPromedio;
}

watch(baseline, resetToBaseline, { immediate: true });

const simInputs = computed<FunnelInputs>(() => ({
	conversaciones: sim.conversaciones,
	ratioAgenda: sim.ratioAgenda / 100,
	tasaShow: sim.tasaShow / 100,
	tasaCierre: sim.tasaCierre / 100,
	ticketPromedio: sim.ticketPromedio,
	facturacion: 0,
}));

const simResult = computed(() => oportunidades(simInputs.value));
const baselineResult = computed(() => (baseline.value ? oportunidades(baseline.value) : 0));
const simDelta = computed(() => (baselineResult.value ? (simResult.value - baselineResult.value) / baselineResult.value : 0));

// ── Qué mueve la cifra ───────────────────────────────────────────
// Mismo espíritu que la tabla del PDF: mover un solo factor y dejar
// los demás como están. Los incrementos son relativos al periodo
// activo (no son los números fijos del ejemplo del PDF), para que
// la tabla tenga sentido en cualquier periodo, no solo en 30 días.
const sensitivity = computed(() => {
	if (!baseline.value) return [];
	const base = baseline.value;
	const baseEuros = oportunidades(base);
	function withChange(overrides: Partial<FunnelInputs>, label: string, from: string, to: string) {
		const euros = oportunidades({ ...base, ...overrides });
		return { label, from, to, euros, delta: baseEuros ? (euros - baseEuros) / baseEuros : 0 };
	}
	return [
		withChange({ ratioAgenda: base.ratioAgenda + 0.05 }, 'Ratio conversación → agenda', formatPorcentaje(base.ratioAgenda), formatPorcentaje(base.ratioAgenda + 0.05)),
		withChange({ tasaCierre: base.tasaCierre + 0.05 }, 'Tasa de cierre del closer', formatPorcentaje(base.tasaCierre), formatPorcentaje(base.tasaCierre + 0.05)),
		withChange({ tasaShow: base.tasaShow + 0.10 }, 'Tasa de show', formatPorcentaje(base.tasaShow), formatPorcentaje(base.tasaShow + 0.10)),
		withChange({ ticketPromedio: base.ticketPromedio + 200 }, 'Ticket promedio', formatMoneda(base.ticketPromedio), formatMoneda(base.ticketPromedio + 200)),
		withChange({ conversaciones: base.conversaciones * 1.1 }, 'Volumen de conversaciones', formatEntero(base.conversaciones), formatEntero(base.conversaciones * 1.1)),
	];
});
</script>

<template>
	<section class="dashboard page-view">
		<header class="page-toolbar">
			<!--
			<div class="page-heading">
				<button class="icon-btn" type="button" title="Volver" @click="router.back()"><i class="ki-filled ki-black-left-line" /></button>
				<div>
					<h1>Detalle de oportunidades</h1>
					<p><RouterLink to="/overview">Home</RouterLink> / Oportunidades</p>
				</div>
			</div>
			-->
			<div>
				<h1>Detalle de oportunidades</h1>
				<p><RouterLink to="/overview">Home</RouterLink> / Oportunidades</p>
			</div>
		</header>

		<template v-if="!baseline || !cascade">
			<section class="kt-card crm-stat-empty" style="min-height: 200px">
				<i class="ki-filled ki-calendar-search" aria-hidden="true" />
				<p>Elegí un rango de fechas para ver este dato.</p>
			</section>
		</template>
		<template v-else>
			<section class="kt-card cascade-card">
				<div class="card-head">
					<div>
						<h2>La cascada, con los números del periodo activo</h2>
						<p>Cada etapa es el resultado de aplicar el ratio de la flecha anterior</p>
					</div>
				</div>
				<div class="cascade-row">
					<div class="cascade-stage">
						<span class="cascade-value">{{ formatEntero(cascade.conversaciones) }}</span>
						<span class="cascade-label">Conversaciones abiertas</span>
					</div>
					<div class="cascade-arrow"><span>× {{ formatPorcentaje(baseline.ratioAgenda) }}</span><i class="ki-filled ki-right" /></div>
					<div class="cascade-stage">
						<span class="cascade-value">{{ formatEntero(cascade.agendas) }}</span>
						<span class="cascade-label">Agendas</span>
					</div>
					<div class="cascade-arrow"><span>× {{ formatPorcentaje(baseline.tasaShow) }}</span><i class="ki-filled ki-right" /></div>
					<div class="cascade-stage">
						<span class="cascade-value">{{ formatEntero(cascade.shows) }}</span>
						<span class="cascade-label">Llamadas con show</span>
					</div>
					<div class="cascade-arrow"><span>× {{ formatPorcentaje(baseline.tasaCierre) }}</span><i class="ki-filled ki-right" /></div>
					<div class="cascade-stage">
						<span class="cascade-value">{{ formatDecimal(cascade.ventas) }}</span>
						<span class="cascade-label">Ventas esperadas</span>
					</div>
					<div class="cascade-arrow"><span>× {{ formatMoneda(baseline.ticketPromedio) }}</span><i class="ki-filled ki-right" /></div>
					<div class="cascade-stage highlight">
						<span class="cascade-value">{{ formatMoneda(cascade.euros) }}</span>
						<span class="cascade-label">€ sobre la mesa</span>
					</div>
				</div>
				<p class="cascade-note">Las ventas esperadas quedan con decimales a propósito — es un valor esperado, no una cuenta de ventas reales. En pantalla, el € final se redondea; el cálculo interno no.</p>
			</section>

			<section class="kt-card simulator-card">
				<div class="card-head">
					<div>
						<h2>Simulador</h2>
						<p>Movés cualquier factor y ves el impacto en € al instante — no toca los datos reales del dashboard</p>
					</div>
					<button class="kt-btn kt-btn-secondary" type="button" @click="resetToBaseline">Restablecer</button>
				</div>

				<div class="sim-grid">
					<label class="sim-field">
						<span>Conversaciones abiertas <b>{{ formatEntero(sim.conversaciones) }}</b></span>
						<input v-model.number="sim.conversaciones" class="range" type="range" min="0" :max="Math.round(baseline.conversaciones * 2)" step="1" />
					</label>
					<label class="sim-field">
						<span>Ratio conversación → agenda <b>{{ sim.ratioAgenda }} %</b></span>
						<input v-model.number="sim.ratioAgenda" class="range" type="range" min="0" max="100" step="1" />
					</label>
					<label class="sim-field">
						<span>Tasa de show <b>{{ sim.tasaShow }} %</b></span>
						<input v-model.number="sim.tasaShow" class="range" type="range" min="0" max="100" step="1" />
					</label>
					<label class="sim-field">
						<span>Tasa de cierre <b>{{ sim.tasaCierre }} %</b></span>
						<input v-model.number="sim.tasaCierre" class="range" type="range" min="0" max="100" step="1" />
					</label>
					<label class="sim-field">
						<span>Ticket promedio <b>{{ formatMoneda(sim.ticketPromedio) }}</b></span>
						<input v-model.number="sim.ticketPromedio" class="range" type="range" min="0" :max="Math.round(baseline.ticketPromedio * 2)" step="50" />
					</label>
				</div>

				<div class="sim-result">
					<div>
						<span class="sim-result-label">€ sobre la mesa con estos valores</span>
						<span class="sim-result-value">{{ formatMoneda(simResult) }}</span>
					</div>
					<div class="crm-stat-change" :class="{ negative: simDelta < 0 }">
						<i class="ki-filled" :class="simDelta < 0 ? 'ki-arrow-down' : 'ki-arrow-up'" />
						<span>{{ simDelta >= 0 ? '+' : '' }}{{ formatPorcentaje(simDelta) }} vs. el dato real del periodo</span>
					</div>
				</div>
			</section>

			<section class="kt-card teams-card">
				<div class="card-head">
					<div>
						<h2>Qué mueve la cifra</h2>
						<p>Mejorar un solo factor por vez, dejando los demás igual que hoy</p>
					</div>
				</div>
				<div class="table-wrap">
					<table class="kt-table">
						<thead>
							<tr>
								<th>Si mejorás…</th>
								<th>De</th>
								<th>A</th>
								<th>Oportunidades</th>
								<th>Efecto</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="row in sensitivity" :key="row.label">
								<td>{{ row.label }}</td>
								<td>{{ row.from }}</td>
								<td>{{ row.to }}</td>
								<td>{{ formatMoneda(row.euros) }}</td>
								<td>
									<span class="crm-stat-change" :class="{ negative: row.delta < 0 }">
										<i class="ki-filled" :class="row.delta < 0 ? 'ki-arrow-down' : 'ki-arrow-up'" />
										<span>{{ row.delta >= 0 ? '+' : '' }}{{ formatPorcentaje(row.delta) }}</span>
									</span>
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</section>
		</template>
	</section>
</template>
