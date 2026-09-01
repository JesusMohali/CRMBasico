import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { FASES, type Fase } from '../constants/fases'

export const useUiStore = defineStore('ui', () => {
  const sidebarOpen = ref(false)
  const sidebarCollapsed = ref(localStorage.getItem('kt-sidebar-collapse') === 'true')
  const searchOpen = ref(false)
  const notificationsOpen = ref(false)
  const profileOpen = ref(false)
  const dark = ref(localStorage.getItem('kt-theme') === 'dark')
  function setTheme(value: boolean) { dark.value = value; document.documentElement.classList.toggle('dark', value); localStorage.setItem('kt-theme', value ? 'dark' : 'light') }
  function setSidebarCollapsed(value: boolean) { sidebarCollapsed.value = value; localStorage.setItem('kt-sidebar-collapse', value ? 'true' : 'false') }
  setTheme(dark.value)
  return { sidebarOpen, sidebarCollapsed, searchOpen, notificationsOpen, profileOpen, dark, setTheme, setSidebarCollapsed }
})

interface Lead {
  id: number
  name: string
  description: string
  rating: number
  updated: string
  phase: Fase
  members: number
}

export const useTeamsStore = defineStore('teams', () => {
  const query = ref('')
  const page = ref(1)
  const selected = ref<number[]>([])
  const teams = ref<Lead[]>([
    { id: 1, name: 'Jesús Mohali', description: 'Podriamos colocar el último mensaje', rating: 5, updated: '21 Oct, 2024', phase: 'Llamada', members: 10, },
    { id: 2, name: 'Diana Lozano', description: 'O de donde escriben', rating: 3.5, updated: '15 Oct, 2024', phase: 'Situación', members: 2, },
    { id: 3, name: 'Rodri Buero', description: 'O alguna descripción', rating: 5, updated: '10 Oct, 2024', phase: 'Compromiso', members: 10, },
    { id: 4, name: 'Miguel Garrido', description: 'Sino se lo quitamos y ya', rating: 5, updated: '05 Oct, 2024', phase: 'Link', members: 2, },
    { id: 5, name: 'Carlos Lozano', description: 'Software engineering & delivery', rating: 4, updated: '28 Sep, 2024', phase: 'Obstáculo', members: 6, },
    { id: 6, name: 'Diego Álvarez', description: 'Support and customer experience', rating: 4, updated: '21 Sep, 2024', phase: 'Objeción', members: 5, },
  ])
  const filtered = computed(() => teams.value.filter(team => team.name.toLowerCase().includes(query.value.toLowerCase()) || team.phase.toLowerCase().includes(query.value.toLowerCase())))
  const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / 5)))
  const visible = computed(() => filtered.value.slice((page.value - 1) * 5, page.value * 5))
  // Cuenta de leads por fase, para el gráfico de dona del dashboard.
  // Sale de la misma lista que alimenta la tabla — un solo origen de
  // datos para los dos.
  const byFase = computed(() => FASES.map(fase => ({ fase, total: teams.value.filter(team => team.phase === fase).length })))
  function search(value: string) { query.value = value; page.value = 1 }
  function toggle(id: number) { selected.value = selected.value.includes(id) ? selected.value.filter(item => item !== id) : [...selected.value, id] }
  return { query, page, selected, teams, filtered, pages, visible, byFase, search, toggle }
})

export const PERIODS = ['7 días', '30 días', '90 días', '6 meses', '1 año', 'Personalizado'] as const
export type Period = (typeof PERIODS)[number]

interface FunnelInputs {
  conversaciones: number
  ratioAgenda: number
  tasaShow: number
  tasaCierre: number
  ticketPromedio: number
  facturacion: number
}

interface PeriodMetrics {
  current: FunnelInputs
  previous: FunnelInputs
}

// Datos de ejemplo por periodo. "Oportunidades" nunca se tipea a mano:
// siempre sale de correr oportunidades() sobre estos factores, tanto
// para el periodo actual como para el anterior — así la variación que
// se muestra también queda calculada, no inventada. Los valores de
// "30 días" respetan el ejemplo del propio brief del cliente
// (1.240 conversaciones · 20,0 % agenda · 60 % show · 25 % cierre ·
// 1.800 € de ticket = 66.960 €).
// Cuando haya backend, este objeto se reemplaza por la respuesta de
// GET /metrics/overview.
const metricsByPeriod: Record<Period, PeriodMetrics> = {
  '7 días': {
    current: { conversaciones: 310, ratioAgenda: 0.198, tasaShow: 0.60, tasaCierre: 0.25, ticketPromedio: 1800, facturacion: 12600 },
    previous: { conversaciones: 268, ratioAgenda: 0.184, tasaShow: 0.57, tasaCierre: 0.24, ticketPromedio: 1780, facturacion: 11400 },
  },
  '30 días': {
    current: { conversaciones: 1240, ratioAgenda: 0.200, tasaShow: 0.60, tasaCierre: 0.25, ticketPromedio: 1800, facturacion: 54000 },
    previous: { conversaciones: 1049, ratioAgenda: 0.176, tasaShow: 0.58, tasaCierre: 0.235, ticketPromedio: 1780, facturacion: 49500 },
  },
  '90 días': {
    current: { conversaciones: 3540, ratioAgenda: 0.205, tasaShow: 0.62, tasaCierre: 0.26, ticketPromedio: 1820, facturacion: 168000 },
    previous: { conversaciones: 3120, ratioAgenda: 0.191, tasaShow: 0.59, tasaCierre: 0.245, ticketPromedio: 1790, facturacion: 149000 },
  },
  '6 meses': {
    current: { conversaciones: 7120, ratioAgenda: 0.210, tasaShow: 0.63, tasaCierre: 0.27, ticketPromedio: 1850, facturacion: 342000 },
    previous: { conversaciones: 6210, ratioAgenda: 0.194, tasaShow: 0.60, tasaCierre: 0.255, ticketPromedio: 1810, facturacion: 298000 },
  },
  '1 año': {
    current: { conversaciones: 14800, ratioAgenda: 0.220, tasaShow: 0.64, tasaCierre: 0.28, ticketPromedio: 1900, facturacion: 712000 },
    previous: { conversaciones: 12100, ratioAgenda: 0.201, tasaShow: 0.61, tasaCierre: 0.26, ticketPromedio: 1830, facturacion: 584000 },
  },
  // Sin backend todavía: reutiliza el ejemplo de 30 días. El rango de
  // fechas que elige el usuario queda guardado (customFrom/customTo)
  // pero todavía no dispara un cálculo propio.
  Personalizado: {
    current: { conversaciones: 1240, ratioAgenda: 0.200, tasaShow: 0.60, tasaCierre: 0.25, ticketPromedio: 1800, facturacion: 54000 },
    previous: { conversaciones: 1049, ratioAgenda: 0.176, tasaShow: 0.58, tasaCierre: 0.235, ticketPromedio: 1780, facturacion: 49500 },
  },
}

function oportunidades(m: FunnelInputs) {
  return m.conversaciones * m.ratioAgenda * m.tasaShow * m.tasaCierre * m.ticketPromedio
}

const numberFormatter = new Intl.NumberFormat('es-ES')
const percentFormatter = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const currencyFormatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export function formatEntero(value: number) { return numberFormatter.format(Math.round(value)) }
export function formatPorcentaje(value: number) { return `${percentFormatter.format(value * 100)} %` }
export function formatMoneda(value: number) { return currencyFormatter.format(Math.round(value)) }

function formatDelta(actual: number, anterior: number, suffix: '%' | 'pts', enPuntos = false) {
  const delta = enPuntos ? (actual - anterior) * 100 : anterior === 0 ? 0 : ((actual - anterior) / anterior) * 100
  const signo = delta >= 0 ? '+' : ''
  return { label: `${signo}${percentFormatter.format(delta)} ${suffix}`, negative: delta < 0 }
}

export interface DashboardWidget {
  key: string
  label: string
  icon: string
  color: string
  chart: string
  valueLabel: string
  deltaLabel: string
  negative: boolean
}

const CHART_PATHS = [
  'M0,37 L9,34 L18,35 L27,29 L36,24 L45,26 L55,20 L64,16 L73,18 L82,12 L91,8 L100,3',
  'M0,37 L9,29 L18,33 L27,27 L36,24 L45,20 L55,23 L64,16 L73,14 L82,11 L91,8 L100,3',
  'M0,37 L9,27 L18,32 L27,22 L36,27 L45,13 L55,18 L64,8 L73,13 L82,3 L91,8 L100,8',
  'M0,30 L9,26 L18,29 L27,21 L36,25 L45,16 L55,20 L64,10 L73,15 L82,6 L91,10 L100,4',
]

export const useDashboardStore = defineStore('dashboard', () => {
  const period = ref<Period>('30 días')
  const customFrom = ref('')
  const customTo = ref('')

  const widgets = computed<DashboardWidget[]>(() => {
    const { current, previous } = metricsByPeriod[period.value]
    const oportunidadesActual = oportunidades(current)
    const oportunidadesAnterior = oportunidades(previous)

    const dConversaciones = formatDelta(current.conversaciones, previous.conversaciones, '%')
    const dRatio = formatDelta(current.ratioAgenda, previous.ratioAgenda, 'pts', true)
    const dOportunidades = formatDelta(oportunidadesActual, oportunidadesAnterior, '%')
    const dFacturacion = formatDelta(current.facturacion, previous.facturacion, '%')

    return [
      { key: 'conversaciones', label: 'Conversaciones abiertas', icon: 'ki-messages', color: '#635bff', chart: CHART_PATHS[0], valueLabel: formatEntero(current.conversaciones), deltaLabel: dConversaciones.label, negative: dConversaciones.negative },
      { key: 'ratioAgenda', label: 'Ratio conversación → agenda', icon: 'ki-calendar-tick', color: '#10a7a7', chart: CHART_PATHS[1], valueLabel: formatPorcentaje(current.ratioAgenda), deltaLabel: dRatio.label, negative: dRatio.negative },
      { key: 'oportunidades', label: 'Oportunidades', icon: 'ki-chart-pie-simple', color: '#2b91e8', chart: CHART_PATHS[2], valueLabel: formatMoneda(oportunidadesActual), deltaLabel: dOportunidades.label, negative: dOportunidades.negative },
      { key: 'facturacion', label: 'Facturación', icon: 'ki-wallet', color: '#e9a11b', chart: CHART_PATHS[3], valueLabel: formatMoneda(current.facturacion), deltaLabel: dFacturacion.label, negative: dFacturacion.negative },
    ]
  })

  function setPeriod(value: Period) { period.value = value }

  return { period, customFrom, customTo, widgets, setPeriod }
})
