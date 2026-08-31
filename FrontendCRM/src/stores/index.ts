import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

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

export const useTeamsStore = defineStore('teams', () => {
  const query = ref('')
  const page = ref(1)
  const selected = ref<number[]>([])
  const teams = ref([
    { id: 1, name: 'Jesús Mohali', description: 'Podriamos colocar el último mensaje', rating: 5, updated: '21 Oct, 2024', phase: 'Inicial', members: 10, },
    { id: 2, name: 'Diana Lozano', description: 'O de donde escriben', rating: 3.5, updated: '15 Oct, 2024', phase: 'Pensativo', members: 2, },
    { id: 3, name: 'Rodri Buero', description: 'O alguna descripción', rating: 5, updated: '10 Oct, 2024', phase: 'Fase 3', members: 10, },
    { id: 4, name: 'Miguel Garrido', description: 'Sino se lo quitamos y ya', rating: 5, updated: '05 Oct, 2024', phase: 'Suscrito', members: 2, },
    { id: 5, name: 'Carlos Lozano', description: 'Software engineering & delivery', rating: 4, updated: '28 Sep, 2024', phase: 'Inicial', members: 6, },
    { id: 6, name: 'Diego Álvarez', description: 'Support and customer experience', rating: 4, updated: '21 Sep, 2024', phase: 'Pensativo', members: 5, },
  ])
  const filtered = computed(() => teams.value.filter(team => team.name.toLowerCase().includes(query.value.toLowerCase()) || team.phase.toLowerCase().includes(query.value.toLowerCase())))
  const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / 5)))
  const visible = computed(() => filtered.value.slice((page.value - 1) * 5, page.value * 5))
  function search(value: string) { query.value = value; page.value = 1 }
  function toggle(id: number) { selected.value = selected.value.includes(id) ? selected.value.filter(item => item !== id) : [...selected.value, id] }
  return { query, page, selected, filtered, pages, visible, search, toggle }
})
