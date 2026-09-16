export const FASES = ['Situación', 'Visión', 'Obstáculo', 'Compromiso', 'Objeción', 'Llamada', 'Link'] as const

export type Fase = (typeof FASES)[number]

// Un solo mapa de colores por fase, usado tanto por el gráfico de dona
// del dashboard como por el badge de "Fase" en la tabla de leads —
// así nunca se desincronizan.
export const FASE_COLORS: Record<Fase, string> = {
	Situación: '#635bff',
	Visión: '#2b91e8',
	Obstáculo: '#e9a11b',
	Compromiso: '#10a7a7',
	Objeción: '#ef4444',
	Llamada: '#8b5cf6',
	Link: '#22c55e',
}
