<template>
	<section class="kt-card calls-summary-card">
		<div class="card-head">
			<div>
				<h2>Llamadas</h2>
				<p>Realizadas, show y no-show del periodo seleccionado</p>
			</div>
		</div>
		<div class="crm-stats-grid">
			<template v-if="dashboard.loading">
				<div v-for="index in 3" :key="`calls-skeleton-${index}`" class="crm-stat-skeleton" aria-hidden="true">
					<span class="skeleton-line w-60" />
					<span class="skeleton-line w-40 tall" />
					<span class="skeleton-line w-30" />
				</div>
			</template>
			<template v-else>
				<article
					v-for="card in dashboard.callWidgets"
					:key="card.key"
					class="crm-stat-card"
					:style="{ '--card-color': card.color }">
					<div v-if="card.empty" class="crm-stat-empty">
						<i class="ki-filled ki-calendar-search" aria-hidden="true" />
						<p>{{ card.emptyReason }}</p>
					</div>
					<div v-else class="crm-stat-content">
						<div>
							<p class="crm-stat-label">{{ card.label }}</p>
							<div class="crm-stat-value-row">
								<p class="crm-stat-value">{{ card.valueLabel }}</p>
								<div class="crm-stat-change" :class="{ negative: card.negative }">
									<i class="ki-filled" :class="card.negative ? 'ki-arrow-down' : 'ki-arrow-up'" aria-hidden="true" />
									<span>{{ card.deltaLabel }}</span>
								</div>
							</div>
						</div>
						<div class="crm-stat-icon" aria-hidden="true">
							<i class="ki-filled" :class="card.icon" />
						</div>
					</div>
				</article>
			</template>
		</div>
	</section>
</template>

<script setup lang="ts">
import { useDashboardStore } from '../../stores';
const dashboard = useDashboardStore();
</script>

<style scoped>
.calls-summary-card {
	margin-top: 20px;
	padding: 20px;
}

.calls-summary-card .card-head {
	margin-bottom: 16px;
}

.calls-summary-card .card-head p {
	margin: 4px 0 0;
}

.crm-stats-grid {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 15px;
}

.crm-stat-card {
	position: relative;
	display: block;
	min-width: 0;
	overflow: hidden;
	min-height: 120px;
	background: var(--surface);
	border: 1px solid var(--border);
	border-radius: 8px;
	box-shadow: 0 2px 5px #1d29390d;
	color: inherit;
	text-decoration: none;
	transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease;
}

.crm-stat-card:hover {
	border-color: color-mix(in srgb, var(--card-color) 35%, var(--border));
	box-shadow: 0 8px 20px #1d29391a;
	transform: translateY(-2px);
}

.crm-stat-content {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
	padding: 17px;
	height: 100%;
}

.crm-stat-label {
	display: flex;
	align-items: center;
	gap: 6px;
	margin: 0 0 8px;
	color: var(--muted-foreground);
	font-size: 12px;
	font-weight: 500;
}

.crm-stat-value-row {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}

.crm-stat-value {
	margin: 0;
	color: var(--text);
	font-size: 30px;
	font-weight: 700;
	letter-spacing: -.02em;
}

.crm-stat-change {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 2px 8px;
	border-radius: 999px;
	background: color-mix(in srgb, #19a66a 14%, transparent);
	color: #19a66a;
	font-size: 11px;
	font-weight: 600;
}

.crm-stat-change i {
	font-size: 12px;
}

.crm-stat-change.negative {
	background: color-mix(in srgb, #ef4444 14%, transparent);
	color: #ef4444;
}

.crm-stat-icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex: none;
	width: 40px;
	height: 40px;
	border-radius: 10px;
	color: var(--card-color);
	background: color-mix(in srgb, var(--card-color) 12%, transparent);
	font-size: 20px;
}

.crm-stat-empty {
	height: 100%;
	min-height: 120px;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 8px;
	padding: 24px;
	text-align: center;
	color: var(--muted-foreground);
}

.crm-stat-empty i {
	font-size: 22px;
}

.crm-stat-empty p {
	margin: 0;
	font-size: 11px;
	line-height: 1.5;
}

.crm-stat-skeleton {
	min-height: 120px;
	padding: 17px;
	display: flex;
	flex-direction: column;
	gap: 10px;
	background: var(--surface);
	border: 1px solid var(--border);
	border-radius: 8px;
}

.skeleton-line {
	display: block;
	height: 12px;
	border-radius: 4px;
	background: var(--border);
	animation: skeleton-pulse 1.4s ease-in-out infinite;
}

.skeleton-line.w-60 {
	width: 60%;
}

.skeleton-line.w-40 {
	width: 40%;
}

.skeleton-line.w-30 {
	width: 30%;
}

.skeleton-line.tall {
	height: 24px;
	margin-top: 4px;
}

@keyframes skeleton-pulse {
	0%, 100% {
		opacity: .5;
	}
	50% {
		opacity: 1;
	}
}

@media (max-width: 1024px) {
	.crm-stats-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (max-width: 700px) {
	.crm-stats-grid {
		grid-template-columns: 1fr;
	}
}
</style>