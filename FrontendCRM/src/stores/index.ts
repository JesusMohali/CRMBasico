import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', () => {
  const sidebarOpen = ref(false)
  const searchOpen = ref(false)
  const notificationsOpen = ref(false)
  const profileOpen = ref(false)
  const dark = ref(localStorage.getItem('kt-theme') === 'dark')
  function setTheme(value: boolean) { dark.value = value; document.documentElement.classList.toggle('dark', value); localStorage.setItem('kt-theme', value ? 'dark' : 'light') }
  setTheme(dark.value)
  return { sidebarOpen, searchOpen, notificationsOpen, profileOpen, dark, setTheme }
})

export const useTeamsStore = defineStore('teams', () => {
  const query = ref('')
  const page = ref(1)
  const selected = ref<number[]>([])
  const teams = ref([
    { id: 1, name: 'Product Management', description: 'Product development & lifecycle', rating: 5, updated: '21 Oct, 2024', members: 10 },
    { id: 2, name: 'Marketing Team', description: 'Campaigns & market analysis', rating: 3.5, updated: '15 Oct, 2024', members: 2 },
    { id: 3, name: 'HR Department', description: 'Talent acquisition, employee welfare', rating: 5, updated: '10 Oct, 2024', members: 10 },
    { id: 4, name: 'Sales Division', description: 'Customer relations, sales strategy', rating: 5, updated: '05 Oct, 2024', members: 2 },
    { id: 5, name: 'Development Team', description: 'Software engineering & delivery', rating: 4, updated: '28 Sep, 2024', members: 6 },
    { id: 6, name: 'Customer Success', description: 'Support and customer experience', rating: 4, updated: '21 Sep, 2024', members: 5 },
  ])
  const filtered = computed(() => teams.value.filter(team => team.name.toLowerCase().includes(query.value.toLowerCase())))
  const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / 5)))
  const visible = computed(() => filtered.value.slice((page.value - 1) * 5, page.value * 5))
  function search(value: string) { query.value = value; page.value = 1 }
  function toggle(id: number) { selected.value = selected.value.includes(id) ? selected.value.filter(item => item !== id) : [...selected.value, id] }
  return { query, page, selected, filtered, pages, visible, search, toggle }
})
