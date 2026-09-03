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
  const phaseFilter = ref<Fase | 'Todas'>('Todas')
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

    return teams.value.filter(team => {
      if (phaseFilter.value !== 'Todas' && team.phase !== phaseFilter.value) return false
      if (!search) return true

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
  function setPhaseFilter(value: Fase | 'Todas') { phaseFilter.value = value; page.value = 1 }
  function toggle(id: number) { selected.value = selected.value.includes(id) ? selected.value.filter(item => item !== id) : [...selected.value, id] }
  return { query, page, selected, phaseFilter, teams, filtered, pages, visible, byFase, search, setPhaseFilter, toggle }
})

interface ConversationRecord {
  id: number
  name: string
  email: string
  channel: string
  phase: Fase
  antiguedad: string
  updated: string
  discardReason?: string
  chatId?: number
}

export const useConversationsStore = defineStore('conversationsStatus', () => {
  const query = ref('')
  const phaseFilter = ref<Fase | 'Todas'>('Todas')

  const conversations = ref<ConversationRecord[]>([
    { id: 1, name: 'Sarah Chen', email: 'sarah.chen@example.com', channel: 'Instagram', phase: 'Compromiso', antiguedad: '2 días', updated: '21 Oct, 2024', chatId: 1 },
    { id: 2, name: 'Marcus Johnson', email: 'marcus.johnson@example.com', channel: 'Instagram', phase: 'Llamada', antiguedad: '5 horas', updated: '20 Oct, 2024', chatId: 2 },
    { id: 3, name: 'Alex Rivera', email: 'alex.rivera@example.com', channel: 'Instagram', phase: 'Situación', antiguedad: '1 hora', updated: '19 Oct, 2024', chatId: 3 },
    { id: 4, name: 'Priya Sharma', email: 'priya.sharma@example.com', channel: 'Instagram', phase: 'Obstáculo', antiguedad: '1 día', updated: '18 Oct, 2024', chatId: 5 },
    { id: 5, name: 'Laura Fernández', email: 'laura.fernandez@example.com', channel: 'Instagram', phase: 'Objeción', antiguedad: '4 días', updated: '17 Oct, 2024', discardReason: 'No calificó' },
    { id: 6, name: 'Diego Salas', email: 'diego.salas@example.com', channel: 'Instagram', phase: 'Objeción', antiguedad: '6 días', updated: '16 Oct, 2024', discardReason: 'No respondió' },
    { id: 7, name: 'Valentina Ríos', email: 'valentina.rios@example.com', channel: 'Instagram', phase: 'Visión', antiguedad: '20 minutos', updated: '21 Oct, 2024' },
    { id: 8, name: 'Tomás Herrera', email: 'tomas.herrera@example.com', channel: 'Instagram', phase: 'Link', antiguedad: '3 horas', updated: '21 Oct, 2024' },
  ])

  const filtered = computed(() => {
    const q = query.value.trim().toLowerCase()
    return conversations.value.filter((item) => {
      if (phaseFilter.value !== 'Todas' && item.phase !== phaseFilter.value) return false
      if (!q) return true
      const haystack = [item.name, item.email, item.channel, item.phase, item.antiguedad, item.updated, item.discardReason ?? '']
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  })

  const countsByFase = computed(() => FASES.map((fase) => ({
    fase,
    total: conversations.value.filter((item) => item.phase === fase).length,
  })))

  function search(value: string) { query.value = value }
  function setPhaseFilter(value: Fase | 'Todas') { phaseFilter.value = value }

  return { query, phaseFilter, conversations, filtered, countsByFase, search, setPhaseFilter }
})

export type AttendanceStatus = 'Show' | 'No-show' | 'Pendiente'

export const WEEKDAYS_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

export const LEAD_TIME_BUCKETS = ['Mismo día', '1-2 días', '3-7 días', '+7 días'] as const
export type LeadTimeBucket = (typeof LEAD_TIME_BUCKETS)[number]

interface Appointment {
  id: number
  name: string
  weekday: string
  leadTimeBucket: LeadTimeBucket
  scheduledAt: string
  status: AttendanceStatus
}

export const useAppointmentsStore = defineStore('appointments', () => {
  const appointments = ref<Appointment[]>([
    { id: 1, name: 'Sarah Chen', weekday: 'Lunes', leadTimeBucket: '1-2 días', scheduledAt: '21 Oct, 2024', status: 'Show' },
    { id: 2, name: 'Marcus Johnson', weekday: 'Martes', leadTimeBucket: 'Mismo día', scheduledAt: '20 Oct, 2024', status: 'Show' },
    { id: 3, name: 'Diana Lozano', weekday: 'Martes', leadTimeBucket: '3-7 días', scheduledAt: '20 Oct, 2024', status: 'No-show' },
    { id: 4, name: 'Rodri Buero', weekday: 'Miércoles', leadTimeBucket: '1-2 días', scheduledAt: '19 Oct, 2024', status: 'Show' },
    { id: 5, name: 'Valeria Suárez', weekday: 'Miércoles', leadTimeBucket: 'Mismo día', scheduledAt: '19 Oct, 2024', status: 'No-show' },
    { id: 6, name: 'Miguel Garrido', weekday: 'Jueves', leadTimeBucket: 'Mismo día', scheduledAt: '18 Oct, 2024', status: 'Show' },
    { id: 7, name: 'Carlos Lozano', weekday: 'Jueves', leadTimeBucket: '+7 días', scheduledAt: '18 Oct, 2024', status: 'No-show' },
    { id: 8, name: 'Martín Ibarra', weekday: 'Jueves', leadTimeBucket: '1-2 días', scheduledAt: '18 Oct, 2024', status: 'Show' },
    { id: 9, name: 'Diego Álvarez', weekday: 'Viernes', leadTimeBucket: '3-7 días', scheduledAt: '17 Oct, 2024', status: 'No-show' },
    { id: 10, name: 'Lucía Fernández', weekday: 'Viernes', leadTimeBucket: '1-2 días', scheduledAt: '17 Oct, 2024', status: 'Show' },
    { id: 11, name: 'Javier Martínez', weekday: 'Sábado', leadTimeBucket: 'Mismo día', scheduledAt: '16 Oct, 2024', status: 'Show' },
    { id: 12, name: 'Camila Torres', weekday: 'Sábado', leadTimeBucket: '3-7 días', scheduledAt: '16 Oct, 2024', status: 'No-show' },
    { id: 13, name: 'Ana Gómez', weekday: 'Lunes', leadTimeBucket: '3-7 días', scheduledAt: '23 Oct, 2024', status: 'Pendiente' },
    { id: 14, name: 'Sofía Ramírez', weekday: 'Martes', leadTimeBucket: '1-2 días', scheduledAt: '24 Oct, 2024', status: 'Pendiente' },
  ])

  const resolved = computed(() => appointments.value.filter((item) => item.status !== 'Pendiente'))
  const showCount = computed(() => resolved.value.filter((item) => item.status === 'Show').length)
  const noShowCount = computed(() => resolved.value.filter((item) => item.status === 'No-show').length)
  const showRate = computed(() => (resolved.value.length ? showCount.value / resolved.value.length : 0))
  const noShowRate = computed(() => (resolved.value.length ? noShowCount.value / resolved.value.length : 0))

  const byWeekday = computed(() => WEEKDAYS_ES.map((day) => ({
    day,
    show: resolved.value.filter((item) => item.weekday === day && item.status === 'Show').length,
    noShow: resolved.value.filter((item) => item.weekday === day && item.status === 'No-show').length,
  })))

  const byLeadTime = computed(() => LEAD_TIME_BUCKETS.map((bucket) => {
    const items = resolved.value.filter((item) => item.leadTimeBucket === bucket)
    const show = items.filter((item) => item.status === 'Show').length
    return { bucket, total: items.length, show, rate: items.length ? show / items.length : 0 }
  }))

  return { appointments, resolved, showCount, noShowCount, showRate, noShowRate, byWeekday, byLeadTime }
})

export const PERIODS = ['7 días', '30 días', '90 días', '6 meses', '1 año', 'Personalizado'] as const
export type Period = (typeof PERIODS)[number]

export interface FunnelInputs {
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

export function oportunidades(m: FunnelInputs) {
  return m.conversaciones * m.ratioAgenda * m.tasaShow * m.tasaCierre * m.ticketPromedio
}

export function llamadasAgendadas(m: FunnelInputs) {
  return m.conversaciones * m.ratioAgenda
}

export function llamadasShow(m: FunnelInputs) {
  return llamadasAgendadas(m) * m.tasaShow
}

export function llamadasNoShow(m: FunnelInputs) {
  return llamadasAgendadas(m) - llamadasShow(m)
}

// Llamadas cuyo horario ya se resolvió (mostraron o no), sin contar las pendientes/futuras.
export function llamadasRealizadas(m: FunnelInputs) {
  return llamadasShow(m) + llamadasNoShow(m)
}

const numberFormatter = new Intl.NumberFormat('es-ES')
const percentFormatter = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const currencyFormatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const decimalFormatter = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export function formatEntero(value: number) { return numberFormatter.format(Math.round(value)) }
export function formatDecimal(value: number) { return decimalFormatter.format(value) }
export function formatPorcentaje(value: number) { return `${percentFormatter.format(value * 100)} %` }
export function formatMoneda(value: number) { return currencyFormatter.format(Math.round(value)) }

function formatDelta(actual: number, anterior: number, suffix: '%' | 'pts', enPuntos = false) {
  if (!enPuntos && anterior === 0) return { label: '—', negative: false }
  const delta = enPuntos ? (actual - anterior) * 100 : ((actual - anterior) / anterior) * 100
  const signo = delta >= 0 ? '+' : ''
  return { label: `${signo}${percentFormatter.format(delta)} ${suffix}`, negative: delta < 0 }
}

// Para métricas donde subir es malo (ej. no-show): invierte el color sin tocar el signo del texto.
function invertGoodBad(delta: { label: string; negative: boolean }) {
  return delta.label === '—' ? delta : { label: delta.label, negative: !delta.negative }
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

// Sección aparte al final del dashboard: solo llamadas realizadas / show / no-show.
const CALL_CHART_PATHS = [
  'M0,34 L9,31 L18,33 L27,26 L36,29 L45,22 L55,25 L64,18 L73,21 L82,14 L91,17 L100,10',
  'M0,33 L9,30 L18,31 L27,24 L36,27 L45,19 L55,22 L64,15 L73,17 L82,11 L91,13 L100,6',
  'M0,8 L9,11 L18,9 L27,14 L36,12 L45,17 L55,15 L64,20 L73,18 L82,24 L91,22 L100,28',
]

const CALL_WIDGET_SHELL = [
  { key: 'llamadasRealizadas', label: 'Llamadas realizadas', icon: 'ki-call', color: '#7239ea', route: '/agendas' },
  { key: 'llamadasShow', label: 'Llamadas show', icon: 'ki-check-circle', color: '#17c653', route: '/agendas' },
  { key: 'llamadasNoShow', label: 'Llamadas no-show', icon: 'ki-cross-circle', color: '#f1416c', route: '/agendas' },
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

  const currentFunnel = computed<FunnelInputs | null>(() => (isRangeIncomplete.value ? null : metricsByPeriod[period.value].current))

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

  // Sección aparte al final del dashboard (ver CallsSummaryCards.vue).
  const callWidgets = computed<DashboardWidget[]>(() => {
    if (isRangeIncomplete.value) {
      return CALL_WIDGET_SHELL.map((shell, index) => ({
        ...shell,
        chart: CALL_CHART_PATHS[index],
        empty: true,
        emptyReason: 'Elegí un rango de fechas para ver este dato.',
        valueLabel: '',
        deltaLabel: '',
        negative: false,
      }))
    }

    const { current, previous } = metricsByPeriod[period.value]
    const dRealizadas = formatDelta(llamadasRealizadas(current), llamadasRealizadas(previous), '%')
    const dShow = formatDelta(llamadasShow(current), llamadasShow(previous), '%')
    const dNoShow = invertGoodBad(formatDelta(llamadasNoShow(current), llamadasNoShow(previous), '%'))

    return [
      { ...CALL_WIDGET_SHELL[0], chart: CALL_CHART_PATHS[0], empty: false, emptyReason: '', valueLabel: formatEntero(llamadasRealizadas(current)), deltaLabel: dRealizadas.label, negative: dRealizadas.negative },
      { ...CALL_WIDGET_SHELL[1], chart: CALL_CHART_PATHS[1], empty: false, emptyReason: '', valueLabel: formatEntero(llamadasShow(current)), deltaLabel: dShow.label, negative: dShow.negative },
      { ...CALL_WIDGET_SHELL[2], chart: CALL_CHART_PATHS[2], empty: false, emptyReason: '', valueLabel: formatEntero(llamadasNoShow(current)), deltaLabel: dNoShow.label, negative: dNoShow.negative },
    ]
  })

  return { period, customFrom, customTo, loading, currentFunnel, widgets, callWidgets, setPeriod }
})

interface ClosedMonth {
  key: string
  label: string
  facturacion: number
  gasto: number
}

interface ExpenseEntry {
  id: number
  tag: string
  amount: number
}

export const useFinanceStore = defineStore('finance', () => {
  const closedMonths = ref<ClosedMonth[]>([
    { key: 'sep', label: 'Sep', facturacion: 38400, gasto: 21900 },
    { key: 'oct', label: 'Oct', facturacion: 40200, gasto: 23100 },
    { key: 'nov', label: 'Nov', facturacion: 46500, gasto: 27000 },
    { key: 'dic', label: 'Dic', facturacion: 31200, gasto: 19300 },
    { key: 'ene', label: 'Ene', facturacion: 42000, gasto: 23900 },
    { key: 'feb', label: 'Feb', facturacion: 45000, gasto: 25400 },
    { key: 'mar', label: 'Mar', facturacion: 49500, gasto: 27700 },
    { key: 'abr', label: 'Abr', facturacion: 55000, gasto: 30200 },
    { key: 'may', label: 'May', facturacion: 61200, gasto: 32600 },
    { key: 'jun', label: 'Jun', facturacion: 58000, gasto: 31300 },
    { key: 'jul', label: 'Jul', facturacion: 44700, gasto: 25900 },
  ])

  const currentMonthLabel = 'Agosto'
  const currentMonthFacturacion = ref(54000)

  const expenses = ref<ExpenseEntry[]>([
    { id: 1, tag: 'Personal / closers', amount: 12400 },
    { id: 2, tag: 'Publicidad (Meta Ads)', amount: 9800 },
    { id: 3, tag: 'Comisiones', amount: 4100 },
    { id: 4, tag: 'Plataformas y software', amount: 3900 },
    { id: 5, tag: 'Otros', amount: 1300 },
  ])

  const currentMonthGasto = computed(() => expenses.value.reduce((sum, item) => sum + item.amount, 0))
  const currentMonthBeneficio = computed(() => currentMonthFacturacion.value - currentMonthGasto.value)

  const allMonths = computed(() => [
    ...closedMonths.value.map((m) => ({ ...m, beneficio: m.facturacion - m.gasto })),
    { key: 'ago', label: currentMonthLabel, facturacion: currentMonthFacturacion.value, gasto: currentMonthGasto.value, beneficio: currentMonthBeneficio.value },
  ])

  const minMonth = computed(() => allMonths.value.reduce((min, m) => (m.facturacion < min.facturacion ? m : min)))
  const maxMonth = computed(() => allMonths.value.reduce((max, m) => (m.facturacion > max.facturacion ? m : max)))

  // Si la etiqueta ya existe (comparación sin importar mayúsculas),
  // el monto se suma a esa fila en vez de crear una nueva.
  function addExpense(tag: string, amount: number) {
    if (!tag.trim() || !amount || amount <= 0) return
    const trimmedTag = tag.trim()
    const existing = expenses.value.find((item) => item.tag.toLowerCase() === trimmedTag.toLowerCase())
    if (existing) {
      existing.amount += amount
    } else {
      expenses.value.push({ id: Date.now(), tag: trimmedTag, amount })
    }
  }

  function removeExpense(id: number) {
    expenses.value = expenses.value.filter((item) => item.id !== id)
  }

  const seasonalDips = computed(() => {
    const months = allMonths.value;
    const dips: { month: string; vsMonth: string; drop: number }[] = [];
    for (let i = 1; i < months.length; i++) {
      const prev = months[i - 1];
      const curr = months[i];
      const change = (curr.facturacion - prev.facturacion) / prev.facturacion;
      if (change < -0.15) dips.push({ month: curr.label, vsMonth: prev.label, drop: -change });
    }
    return dips;
  })

  const closedMonthsCount = computed(() => allMonths.value.length)

  const readingStage = computed<'insuficiente' | 'basica' | 'completa'>(() => {
    if (closedMonthsCount.value < 3) return 'insuficiente'
    if (closedMonthsCount.value < 6) return 'basica'
    return 'completa'
  })

  return {
    closedMonths,
    currentMonthLabel,
    currentMonthFacturacion,
    expenses,
    currentMonthGasto,
    currentMonthBeneficio,
    allMonths,
    minMonth,
    maxMonth,
    seasonalDips,
    closedMonthsCount,
    readingStage,
    addExpense,
    removeExpense,
  }
})

// ── Fase 4 · Carpetas de chat ───────────────────────────────────────
// Agrupan conversaciones por un único filtro a la vez (etiqueta, fase
// o tiempo desde el último mensaje). "Todos" no vive acá: es un grupo
// fijo que arma el propio ChatSidebar, así nunca se puede borrar.
export type ChatFolderFilterField = 'tag' | 'phase' | 'recency'

export const CHAT_FOLDER_FILTER_FIELDS: { value: ChatFolderFilterField; label: string }[] = [
  { value: 'tag', label: 'Etiqueta' },
  { value: 'phase', label: 'Fase' },
  { value: 'recency', label: 'Última vez que escribieron' },
]

export interface ChatFolder {
  id: number
  name: string
  icon: string
  color: string
  filterField: ChatFolderFilterField
  filterValue: string
}

// Bucket de recencia a partir de una fecha real — mismo criterio que
// LEAD_TIME_BUCKETS (Agendas), reusado acá para "tiempo desde el
// último mensaje".
export function recencyBucket(date: Date, now: Date = new Date()): LeadTimeBucket {
  const days = Math.floor((now.getTime() - date.getTime()) / 86400000)
  if (days <= 0) return 'Mismo día'
  if (days <= 2) return '1-2 días'
  if (days <= 7) return '3-7 días'
  return '+7 días'
}

export const useChatFoldersStore = defineStore('chatFolders', () => {
  const folders = ref<ChatFolder[]>([
    { id: 1, name: 'Prioritarios', icon: 'ki-flag', color: '#f1416c', filterField: 'tag', filterValue: 'Prioritario' },
  ])
  let nextId = 2

  function addFolder(input: Omit<ChatFolder, 'id'>) {
    folders.value.push({ id: nextId++, ...input })
  }

  function updateFolder(id: number, input: Omit<ChatFolder, 'id'>) {
    const folder = folders.value.find((item) => item.id === id)
    if (folder) Object.assign(folder, input)
  }

  function removeFolder(id: number) {
    folders.value = folders.value.filter((item) => item.id !== id)
  }

  return { folders, addFolder, updateFolder, removeFolder }
})

// ── Confirm dialog global ────────────────────────────────────────────
// Reemplaza al confirm() nativo del navegador. Cualquier componente
// puede hacer `await useConfirmStore().ask({ message: '...' })` y le
// llega un booleano, igual que con confirm(), pero con la estética
// de la app. El componente que lo renderiza es ConfirmDialog.vue,
// montado una sola vez en App.vue.
interface ConfirmOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

export const useConfirmStore = defineStore('confirm', () => {
  const open = ref(false)
  const title = ref('')
  const message = ref('')
  const confirmText = ref('Confirmar')
  const cancelText = ref('Cancelar')
  const danger = ref(false)
  let resolver: ((value: boolean) => void) | null = null

  function ask(options: ConfirmOptions): Promise<boolean> {
    title.value = options.title ?? ''
    message.value = options.message
    confirmText.value = options.confirmText ?? 'Confirmar'
    cancelText.value = options.cancelText ?? 'Cancelar'
    danger.value = options.danger ?? false
    open.value = true
    return new Promise((resolve) => { resolver = resolve })
  }

  function resolve(value: boolean) {
    open.value = false
    resolver?.(value)
    resolver = null
  }

  return { open, title, message, confirmText, cancelText, danger, ask, resolve }
})