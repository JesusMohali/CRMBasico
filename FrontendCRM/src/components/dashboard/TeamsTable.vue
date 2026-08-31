<script setup lang="ts">
import { computed } from 'vue';
import { useTeamsStore } from '../../stores';
const teams = useTeamsStore();
const allSelected = computed(() => teams.visible.length > 0 && teams.visible.every((team) => teams.selected.includes(team.id)));
function handleSearch(event: Event) {
	teams.search((event.target as HTMLInputElement).value);
}
function toggleAll() {
	teams.visible.forEach((team: { id: number }) => {
		console.log(team)
		console.log(allSelected.value)
		if (allSelected.value) {
			if (teams.selected.includes(team.id)) teams.toggle(team.id);
		} else if (!teams.selected.includes(team.id)) teams.toggle(team.id);
	});
}
</script>
<template>
	<section class="kt-card teams-card">
		<div class="card-head">
			<div>
				<h2>Leads</h2>
				<p>Estado de los últimos X leads</p>
			</div>
			<div class="table-tools">
				<label class="search-field">⌕<input placeholder="Buscar leads" :value="teams.query" @input="handleSearch" /></label
				><!-- <button class="kt-btn kt-btn-secondary">Export</button> -->
			</div>
		</div>
		<div class="table-wrap">
			<table class="kt-table">
				<thead>
					<tr>
						<!-- <th><input type="checkbox" :checked="allSelected" @change="toggleAll" /></th> -->
						<th>Usuario</th>
						<th>Calificación</th>
						<th>Última Actualización</th>
						<th>Fase</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="team in teams.visible" :key="team.id">
						<!-- <td><input type="checkbox" :checked="teams.selected.includes(team.id)" @change="teams.toggle(team.id)" /></td> -->
						<td>
							<div class="team-name"><span class="team-mark">{{ team.name.slice(0, 1) }}</span><div><b>{{ team.name }}</b><small>{{ team.description }}</small></div></div>
						</td>
						<td><span class="rating"><i v-for="index in 5" :key="index" class="ki-solid ki-star" :class="{ off: index > team.rating }" /></span></td>
						<td>{{ team.updated }}</td>
						<td><span class="kt-badge kt-badge-secondary">{{ team.phase }}</span></td>
						<!-- <span class="kt-badge kt-badge-warning kt-badge-sm rounded-full gap-1">
               <i class="ki-solid ki-star text-white -mt-0.5">
               </i>
               5.0
              </span> -->
						<!-- <td><div class="member-stack"><span v-for="index in Math.min(team.members, 3)" :key="index" class="avatar">{{ index }}</span><span class="member-more">+{{ team.members }}</span></div></td> -->
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
