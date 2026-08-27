<template>
	<div class="crm-stats-grid">
		<article v-for="(card, index) in cards" :key="card.label" class="crm-stat-card" :style="{ '--card-color': card.color }">
			<div class="crm-stat-content">
				<div>
					<p class="crm-stat-label">{{ card.label }}</p>
					<p class="crm-stat-value">{{ card.value }}</p>
					<div class="crm-stat-change" :class="{ negative: card.negative }">
						<i class="ki-filled" :class="card.negative ? 'ki-arrow-down' : 'ki-arrow-up'" aria-hidden="true" />
						<span>{{ card.change }}</span>
					</div>
				</div>
				<div class="crm-stat-icon" aria-hidden="true">
					<i class="ki-filled" :class="card.icon" />
				</div>
			</div>
			<svg class="crm-stat-chart" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
				<defs>
					<linearGradient :id="`crm-stat-gradient-${index}`" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stop-color="var(--card-color)" stop-opacity=".18" />
						<stop offset="100%" stop-color="var(--card-color)" stop-opacity="0" />
					</linearGradient>
				</defs>
				<path :d="`${card.chart} L100,40 L0,40 Z`" :fill="`url(#crm-stat-gradient-${index})`" />
				<path :d="card.chart" fill="none" stroke="var(--card-color)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
			</svg>
		</article>
	</div>
</template>

<script setup lang="ts">
type StatCard = {
	label: string
	value: string
	change: string
	negative?: boolean
	icon: string
	color: string
	chart: string
}

const cards: StatCard[] = [
	{ label: 'Total Pipeline', value: '$842K', change: '+12.4%', icon: 'ki-briefcase', color: '#635bff', chart: 'M0,37 L9,34 L18,35 L27,29 L36,24 L45,26 L55,20 L64,16 L73,18 L82,12 L91,8 L100,3' },
	{ label: 'Won This Month', value: '$284K', change: '+22.1%', icon: 'ki-cup', color: '#10a7a7', chart: 'M0,37 L9,29 L18,33 L27,27 L36,24 L45,20 L55,23 L64,16 L73,14 L82,11 L91,8 L100,3' },
		{ label: 'Win Rate', value: '34.2%', change: '+3.8%', icon: 'ki-chart-simple', color: '#2b91e8', chart: 'M0,37 L9,27 L18,32 L27,22 L36,27 L45,13 L55,18 L64,8 L73,13 L82,3 L91,8 L100,8' },
		{ label: 'Avg Deal Size', value: '$18.4K', change: '-2.1%', negative: true, icon: 'ki-graph-up', color: '#e9a11b', chart: 'M0,17 L9,3 L18,23 L27,10 L36,30 L45,23 L55,30 L64,37 L73,23 L82,30 L91,30 L100,30' },
]
</script>

<style scoped>
.crm-stats-grid {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 15px;
	margin-bottom: 18px;
}

.crm-stat-card {
	position: relative;
	min-width: 0;
	overflow: hidden;
	min-height: 176px;
	background: var(--surface);
	border: 1px solid var(--border);
	border-radius: 8px;
	box-shadow: 0 2px 5px #1d29390d;
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
	padding: 17px 17px 0;
}

.crm-stat-label {
	margin: 0 0 8px;
	color: var(--muted);
	font-size: 12px;
	font-weight: 500;
}

.crm-stat-value {
	margin: 0;
	color: var(--text);
	font-size: 24px;
	font-weight: 700;
	letter-spacing: -.02em;
}

.crm-stat-change {
	display: flex;
	align-items: center;
	gap: 5px;
	margin-top: 7px;
	color: #19a66a;
	font-size: 11px;
	font-weight: 600;
}

.crm-stat-change i {
	font-size: 12px;
}

.crm-stat-change.negative {
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

.crm-stat-chart {
	display: block;
	width: 100%;
	height: 54px;
	margin-top: 18px;
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
