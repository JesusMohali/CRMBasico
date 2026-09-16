<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useTeamsStore } from '../../stores';
import { FASES, FASE_COLORS } from '../../constants/fases';
import SortableTh from '../common/SortableTh.vue';
const teams = useTeamsStore();
const allSelected = computed(() => teams.visible.length > 0 && teams.visible.every((team) => teams.selected.includes(team.id)));
function handleSearch(event: Event) {
	teams.search((event.target as HTMLInputElement).value);
}
function toggleAll() {
	teams.visible.forEach((team: { id: number }) => {
		if (allSelected.value) {
			if (teams.selected.includes(team.id)) teams.toggle(team.id);
		} else if (!teams.selected.includes(team.id)) teams.toggle(team.id);
	});
}

const phaseMenuOpen = ref(false);
const phaseMenu = ref<HTMLElement>();
function closePhaseMenu(event: MouseEvent) {
	if (phaseMenu.value && !phaseMenu.value.contains(event.target as Node)) phaseMenuOpen.value = false;
}
onMounted(() => document.addEventListener('click', closePhaseMenu));
onBeforeUnmount(() => document.removeEventListener('click', closePhaseMenu));
</script>
<template>
	<section class="kt-card teams-card">
		<div class="card-head">
			<div>
				<h2>Leads</h2>
				<p>Estado de los últimos X leads</p>
			</div>
			<div class="table-tools">
				<div ref="phaseMenu" class="kt-menu date-menu phase-menu">
					<button class="kt-btn kt-btn-outline date-toggle" type="button" :aria-expanded="phaseMenuOpen" @click.stop="phaseMenuOpen = !phaseMenuOpen">
						<span v-if="teams.phaseFilter !== 'Todas'" class="phase-dot" :style="{ '--fase-color': FASE_COLORS[teams.phaseFilter] }" />
						<span>{{ teams.phaseFilter === 'Todas' ? 'Todas las fases' : teams.phaseFilter }}</span>
						<i class="ki-filled ki-down" />
					</button>
					<Transition name="menu-pop">
						<div v-if="phaseMenuOpen" class="kt-menu-dropdown date-dropdown">
							<button
								class="date-option"
								:class="{ active: teams.phaseFilter === 'Todas' }"
								type="button"
								@click="
									teams.setPhaseFilter('Todas');
									phaseMenuOpen = false;
								">
								Todas las fases
							</button>
							<button
								v-for="fase in FASES"
								:key="fase"
								class="date-option"
								:class="{ active: teams.phaseFilter === fase }"
								type="button"
								@click="
									teams.setPhaseFilter(fase);
									phaseMenuOpen = false;
								">
								<span class="phase-dot" :style="{ '--fase-color': FASE_COLORS[fase] }" />{{ fase }}
							</button>
						</div>
					</Transition>
				</div>
				<label class="search-field">⌕<input placeholder="Escribe para buscar..." :value="teams.query" @input="handleSearch" /></label>
			</div>
		</div>
		<div class="table-wrap">
			<table class="kt-table">
				<thead>
					<tr>
						<!-- <th><input type="checkbox" :checked="allSelected" @change="toggleAll" /></th> -->
						<SortableTh label="Nombre completo" :active="teams.sortKey === 'name'" :direction="teams.sortDir" @sort="teams.setSort('name')" />
						<SortableTh label="Usuario" :active="teams.sortKey === 'user'" :direction="teams.sortDir" @sort="teams.setSort('user')" />
						<SortableTh label="Última Actualización" :active="teams.sortKey === 'updated'" :direction="teams.sortDir" @sort="teams.setSort('updated')" />
						<SortableTh label="Fase" :active="teams.sortKey === 'phase'" :direction="teams.sortDir" @sort="teams.setSort('phase')" />
					</tr>
				</thead>
				<tbody>
					<tr v-for="team in teams.visible" :key="team.id">
						<!-- <td><input type="checkbox" :checked="teams.selected.includes(team.id)" @change="teams.toggle(team.id)" /></td> -->
						<td>
							<div class="team-name"><span class="team-mark">{{ team.name.slice(0, 1) }}</span><div><b>{{ team.name }}</b><small>{{ team.email }}</small></div></div>
						</td>
						<td>{{ team.user }}</td>
						<td>{{ team.updated }}</td>
						<td><span class="kt-badge fase-badge" :style="{ '--fase-color': FASE_COLORS[team.phase] }">{{ team.phase }}</span></td>
						<!-- <span class="kt-badge kt-badge-warning kt-badge-sm rounded-full gap-1">
             <i class="ki-solid ki-star text-white -mt-0.5">
             </i>
             5.0
            </span> -->
						<!-- <td><div class="member-stack"><span v-for="index in Math.min(team.members, 3)" :key="index" class="avatar">{{ index }}</span><span class="member-more">+{{ team.members }}</span></div></td> -->
					</tr>
					<tr v-if="!teams.filtered.length">
						<td colspan="4" class="table-empty">No hay leads que coincidan con este filtro.</td>
					</tr>
				</tbody>
			</table>
		</div>
		<div class="pagination">
			<span>{{ teams.filtered.length }} teams</span>
			<div>
				<button :disabled="teams.page === 1" @click="teams.page--">‹</button><b>{{ teams.page }}</b
				><button :disabled="teams.page >= teams.pages" @click="teams.page++">›</button>
			</div>
		</div>
	</section>
</template>