<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useConversationsStore } from '../stores';
import { FASE_COLORS } from '../constants/fases';

const router = useRouter();
const conversations = useConversationsStore();

function handleSearch(event: Event) {
	conversations.search((event.target as HTMLInputElement).value);
}
</script>

<template>
	<section class="dashboard page-view">
		<header class="page-toolbar">
			<div class="page-heading">
				<!-- <button class="icon-btn" type="button" title="Volver" @click="router.back()"><i class="ki-filled ki-black-left-line" /></button> -->
				<div>
					<h1>Estado de las conversaciones</h1>
					<p><RouterLink to="/overview">Home</RouterLink> / Conversaciones</p>
				</div>
			</div>
		</header>

		<section class="status-summary">
			<button class="status-pill" :class="{ active: conversations.phaseFilter === 'Todas' }" type="button" @click="conversations.setPhaseFilter('Todas')">
				<span>Todas</span><b>{{ conversations.conversations.length }}</b>
			</button>
			<button
				v-for="item in conversations.countsByFase"
				:key="item.fase"
				class="status-pill"
				:class="{ active: conversations.phaseFilter === item.fase }"
				:style="{ '--fase-color': FASE_COLORS[item.fase] }"
				type="button"
				@click="conversations.setPhaseFilter(item.fase)">
				<span>{{ item.fase }}</span><b>{{ item.total }}</b>
			</button>
		</section>

		<section class="kt-card teams-card">
			<div class="card-head">
				<div>
					<h2>Conversaciones</h2>
					<p>Fase y antigüedad de cada conversación del periodo</p>
				</div>
				<div class="table-tools">
					<label class="search-field">⌕<input placeholder="Buscar por nombre, correo, canal, fase..." :value="conversations.query" @input="handleSearch" /></label>
				</div>
			</div>
			<div class="table-wrap">
				<table class="kt-table">
					<thead>
						<tr>
							<th>Usuario</th>
							<th>Correo</th>
							<th>Canal</th>
							<th>Fase</th>
							<th>Antigüedad</th>
							<th>Última actualización</th>
							<th>Motivo</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="item in conversations.filtered" :key="item.id">
							<td>
								<div class="team-name"><span class="team-mark">{{ item.name.slice(0, 1) }}</span><b>{{ item.name }}</b></div>
							</td>
							<td>{{ item.email }}</td>
							<td>{{ item.channel }}</td>
							<td><span class="conv-fase-badge" :style="{ '--fase-color': FASE_COLORS[item.phase] }">{{ item.phase }}</span></td>
							<td>{{ item.antiguedad }}</td>
							<td>{{ item.updated }}</td>
							<td>{{ item.discardReason ?? '—' }}</td>
							<td>
								<RouterLink v-if="item.chatId" class="kt-btn kt-btn-secondary" :to="{ path: '/chats', query: { id: item.chatId } }"><i class="ki-filled ki-message-text" /> Ir al chat</RouterLink>
							</td>
						</tr>
						<tr v-if="!conversations.filtered.length">
							<td colspan="8" class="table-empty">No hay conversaciones que coincidan con la búsqueda.</td>
						</tr>
					</tbody>
				</table>
			</div>
		</section>
	</section>
</template>