import { computed, ref, watch } from 'vue'
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
  email: string
  user: string
  updated: string
  phase: Fase
}

export const useTeamsStore = defineStore('teams', () => {
  const query = ref('')
  const page = ref(1)
  const selected = ref<number[]>([])
  const teams = ref<Lead[]>([
    { id: 1, name: 'Jesús Mohali', email: 'jesus.mohali@example.com', user: 'jesus.mohali', updated: '21 Oct, 2024', phase: 'Llamada', },
    { id: 2, name: 'Diana Lozano', email: 'diana.lozano@example.com', user: 'diana.lozano', updated: '15 Oct, 2024', phase: 'Situación', },
    { id: 3, name: 'Rodri Buero', email: 'rodrigo.buero@example.com', user: 'rodrigo.buero', updated: '10 Oct, 2024', phase: 'Compromiso', },
    { id: 4, name: 'Miguel Garrido', email: 'miguel.garrido@example.com', user: 'miguel.garrido', updated: '05 Oct, 2024', phase: 'Link', },
    { id: 5, name: 'Carlos Lozano', email: 'carlos.lozano@example.com', user: 'carlos.lozano', updated: '28 Sep, 2024', phase: 'Obstáculo', },
    { id: 6, name: 'Diego Álvarez', email: 'diego.alvarez@example.com', user: 'diego.alvarez', updated: '21 Sep, 2024', phase: 'Objeción', },
    { id: 7, name: 'Lucía Fernández', email: 'lucia.fernandez@example.com', user: 'lucia.fernandez', updated: '15 Sep, 2024', phase: 'Compromiso', },
    { id: 8, name: 'Javier Martínez', email: 'javier.martinez@example.com', user: 'javier.martinez', updated: '10 Sep, 2024', phase: 'Situación', },
    { id: 9, name: 'Ana Gómez', email: 'ana.gomez@example.com', user: 'ana.gomez', updated: '05 Sep, 2024', phase: 'Llamada', },
    { id: 10, name: 'Sofía Ramírez', email: 'sofia.ramirez@example.com', user: 'sofia.ramirez', updated: '28 Sep, 2024', phase: 'Situación', },
  ])
  const filtered = computed(() => {
    const search = query.value.trim().toLowerCase()
    if (!search) return teams.value

    return teams.value.filter(team => {
      const haystack = [
        team.name,
        team.email,
        team.user,
        team.updated,
        team.phase,
      ].join(' ').toLowerCase()

      return haystack.includes(search)
    })
  })
  const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / 5)))
  const visible = computed(() => filtered.value.slice((page.value - 1) * 5, page.value * 5))
  const byFase = computed(() => FASES.map(fase => ({ fase, total: teams.value.filter(team => team.phase === fase).length })))
  function search(value: string) { query.value = value; page.value = 1 }
  function toggle(id: number) { selected.value = selected.value.includes(id) ? selected.value.filter(item => item !== id) : [...selected.value, id] }
  return { query, page, selected, teams, filtered, pages, visible, byFase, search, toggle }
})

export type ConversationStatus = 'Nueva' | 'En conversación' | 'Esperando respuesta' | 'Agendada' | 'Descartada'

export const CONVERSATION_STATUSES: ConversationStatus[] = ['Nueva', 'En conversación', 'Esperando respuesta', 'Agendada', 'Descartada']

export const CONVERSATION_STATUS_COLORS: Record<ConversationStatus, string> = {
  Nueva: '#2b91e8',
  'En conversación': '#635bff',
  'Esperando respuesta': '#e9a11b',
  Agendada: '#10a7a7',
  Descartada: '#ef4444',
}

interface ConversationRecord {
  id: number
  name: string
  channel: string
  status: ConversationStatus
  antiguedad: string
  updated: string
  discardReason?: string
  chatId?: number
}

export const useConversationsStore = defineStore('conversationsStatus', () => {
  const query = ref('')
  const statusFilter = ref<ConversationStatus | 'Todas'>('Todas')

  const conversations = ref<ConversationRecord[]>([
    { id: 1, name: 'Sarah Chen', channel: 'Instagram', status: 'Agendada', antiguedad: '2 días', updated: '21 Oct, 2024', chatId: 1 },
    { id: 2, name: 'Marcus Johnson', channel: 'Instagram', status: 'En conversación', antiguedad: '5 horas', updated: '20 Oct, 2024', chatId: 2 },
    { id: 3, name: 'Alex Rivera', channel: 'Instagram', status: 'Nueva', antiguedad: '1 hora', updated: '19 Oct, 2024', chatId: 3 },
    { id: 4, name: 'Priya Sharma', channel: 'Instagram', status: 'Esperando respuesta', antiguedad: '1 día', updated: '18 Oct, 2024', chatId: 5 },
    { id: 5, name: 'Laura Fernández', channel: 'Instagram', status: 'Descartada', antiguedad: '4 días', updated: '17 Oct, 2024', discardReason: 'No calificó' },
    { id: 6, name: 'Diego Salas', channel: 'Instagram', status: 'Descartada', antiguedad: '6 días', updated: '16 Oct, 2024', discardReason: 'No respondió' },
    { id: 7, name: 'Valentina Ríos', channel: 'Instagram', status: 'Nueva', antiguedad: '20 minutos', updated: '21 Oct, 2024' },
    { id: 8, name: 'Tomás Herrera', channel: 'Instagram', status: 'En conversación', antiguedad: '3 horas', updated: '21 Oct, 2024' },
  ])

  const filtered = computed(() => conversations.value.filter((item) =>
    (statusFilter.value === 'Todas' || item.status === statusFilter.value) &&
    item.name.toLowerCase().includes(query.value.toLowerCase())
  ))

  const countsByStatus = computed(() => CONVERSATION_STATUSES.map((status) => ({
    status,
    total: conversations.value.filter((item) => item.status === status).length,
  })))

  function search(value: string) { query.value = value }
  function setStatusFilter(value: ConversationStatus | 'Todas') { statusFilter.value = value }

  return { query, statusFilter, conversations, filtered, countsByStatus, search, setStatusFilter }
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
  estimado?: boolean
}

const metricsByPeriod: Record<Period, PeriodMetrics> = {
  '7 días': {
    current: { conversaciones: 310, ratioAgenda: 0.198, tasaShow: 0.60, tasaCierre: 0.25, ticketPromedio: 1800, facturacion: 12600 },
    previous: { conversaciones: 268, ratioAgenda: 0.184, tasaShow: 0.57, tasaCierre: 0.24, ticketPromedio: 1780, facturacion: 11400 },
    estimado: true,
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
  if (!enPuntos && anterior === 0) return { label: '—', negative: false }
  const delta = enPuntos ? (actual - anterior) * 100 : ((actual - anterior) / anterior) * 100
  const signo = delta >= 0 ? '+' : ''
  return { label: `${signo}${percentFormatter.format(delta)} ${suffix}`, negative: delta < 0 }
}

export interface DashboardWidget {
  key: string
  label: string
  icon: string
  color: string
  route: string
  chart: string
  empty: boolean
  emptyReason: string
  valueLabel: string
  deltaLabel: string
  negative: boolean
  estimado?: boolean
}

const CHART_PATHS = [
  'M0,37 L9,34 L18,35 L27,29 L36,24 L45,26 L55,20 L64,16 L73,18 L82,12 L91,8 L100,3',
  'M0,37 L9,29 L18,33 L27,27 L36,24 L45,20 L55,23 L64,16 L73,14 L82,11 L91,8 L100,3',
  'M0,37 L9,27 L18,32 L27,22 L36,27 L45,13 L55,18 L64,8 L73,13 L82,3 L91,8 L100,8',
  'M0,30 L9,26 L18,29 L27,21 L36,25 L45,16 L55,20 L64,10 L73,15 L82,6 L91,10 L100,4',
]

const WIDGET_SHELL = [
  { key: 'conversaciones', label: 'Conversaciones abiertas', icon: 'ki-messages', color: '#635bff', route: '/conversaciones' },
  { key: 'ratioAgenda', label: 'Ratio conversación → agenda', icon: 'ki-calendar-tick', color: '#10a7a7', route: '/agendas' },
  { key: 'oportunidades', label: 'Oportunidades', icon: 'ki-chart-pie-simple', color: '#2b91e8', route: '/oportunidades' },
  { key: 'facturacion', label: 'Facturación', icon: 'ki-wallet', color: '#e9a11b', route: '/finanzas' },
] as const

export const useDashboardStore = defineStore('dashboard', () => {
  const period = ref<Period>('30 días')
  const customFrom = ref('')
  const customTo = ref('')
  const loading = ref(false)

  function simulateFetch() {
    loading.value = true
    window.setTimeout(() => { loading.value = false }, 500)
  }

  function setPeriod(value: Period) {
    period.value = value
    simulateFetch()
  }

  watch([customFrom, customTo], ([from, to], [prevFrom, prevTo]) => {
    const completedNow = from && to && !(prevFrom && prevTo)
    if (completedNow) simulateFetch()
  })

  const isRangeIncomplete = computed(() => period.value === 'Personalizado' && (!customFrom.value || !customTo.value))

  const widgets = computed<DashboardWidget[]>(() => {
    if (isRangeIncomplete.value) {
      return WIDGET_SHELL.map((shell, index) => ({
        ...shell,
        chart: CHART_PATHS[index],
        empty: true,
        emptyReason: 'Elegí un rango de fechas para ver este dato.',
        valueLabel: '',
        deltaLabel: '',
        negative: false,
      }))
    }

    const { current, previous, estimado } = metricsByPeriod[period.value]
    const oportunidadesActual = oportunidades(current)
    const oportunidadesAnterior = oportunidades(previous)

    const dConversaciones = formatDelta(current.conversaciones, previous.conversaciones, '%')
    const dRatio = formatDelta(current.ratioAgenda, previous.ratioAgenda, 'pts', true)
    const dOportunidades = formatDelta(oportunidadesActual, oportunidadesAnterior, '%')
    const dFacturacion = formatDelta(current.facturacion, previous.facturacion, '%')

    return [
      { ...WIDGET_SHELL[0], chart: CHART_PATHS[0], empty: false, emptyReason: '', valueLabel: formatEntero(current.conversaciones), deltaLabel: dConversaciones.label, negative: dConversaciones.negative },
      { ...WIDGET_SHELL[1], chart: CHART_PATHS[1], empty: false, emptyReason: '', valueLabel: formatPorcentaje(current.ratioAgenda), deltaLabel: dRatio.label, negative: dRatio.negative },
      { ...WIDGET_SHELL[2], chart: CHART_PATHS[2], empty: false, emptyReason: '', valueLabel: formatMoneda(oportunidadesActual), deltaLabel: dOportunidades.label, negative: dOportunidades.negative, estimado },
      { ...WIDGET_SHELL[3], chart: CHART_PATHS[3], empty: false, emptyReason: '', valueLabel: formatMoneda(current.facturacion), deltaLabel: dFacturacion.label, negative: dFacturacion.negative },
    ]
  })

  return { period, customFrom, customTo, loading, widgets, setPeriod }
})
