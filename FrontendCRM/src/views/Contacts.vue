<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useContactsStore, type Contact } from '../stores';
import { FASE_COLORS } from '../constants/fases';
import SortableTh from '../components/common/SortableTh.vue';

const router = useRouter();
const contacts = useContactsStore();
const query = ref('');

const filtered = computed(() => {
	const q = query.value.trim().toLowerCase();
	if (!q) return contacts.sorted;
	return contacts.sorted.filter((item) => [item.name, item.email, item.phone, item.phase, ...item.tags].join(' ').toLowerCase().includes(q));
});

function goToChat(contact: Contact) {
	router.push({ path: '/chats', query: { id: contact.id } });
}

function formatDate(date: Date) {
	return date.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatRelative(date: Date) {
	const days = Math.floor((Date.now() - date.getTime()) / 86400000);
	if (days <= 0) return 'Hoy';
	if (days === 1) return 'Ayer';
	if (days < 7) return `Hace ${days} días`;
	const weeks = Math.floor(days / 7);
	if (weeks < 5) return `Hace ${weeks} semana${weeks > 1 ? 's' : ''}`;
	return formatDate(date);
}
</script>

<template>
	<section class="dashboard page-view">
		<header class="page-toolbar">
			<div class="page-heading">
				<div>
					<h1>Contactos</h1>
					<p><RouterLink to="/overview">Home</RouterLink> / Contactos</p>
				</div>
			</div>
		</header>

		<section class="kt-card teams-card">
			<div class="card-head">
				<div>
					<h2>Contactos</h2>
					<p>{{ contacts.contacts.length }} contactos en total</p>
				</div>
				<div class="table-tools">
					<label class="search-field">⌕<input v-model="query" placeholder="Buscar por nombre, correo, teléfono, fase..." /></label>
				</div>
			</div>
			<div class="table-wrap">
				<table class="kt-table">
					<thead>
						<tr>
							<SortableTh label="Nombre de contacto" :active="contacts.sortKey === 'name'" :direction="contacts.sortDir" @sort="contacts.setSort('name')" />
							<SortableTh label="Teléfono" :active="contacts.sortKey === 'phone'" :direction="contacts.sortDir" @sort="contacts.setSort('phone')" />
							<SortableTh label="Email" :active="contacts.sortKey === 'email'" :direction="contacts.sortDir" @sort="contacts.setSort('email')" />
							<SortableTh label="Fecha de creación" :active="contacts.sortKey === 'createdAt'" :direction="contacts.sortDir" @sort="contacts.setSort('createdAt')" />
							<SortableTh label="Última actividad" :active="contacts.sortKey === 'updatedAt'" :direction="contacts.sortDir" @sort="contacts.setSort('updatedAt')" />
							<th>Etiquetas</th>
							<SortableTh label="Fase" :active="contacts.sortKey === 'phase'" :direction="contacts.sortDir" @sort="contacts.setSort('phase')" />
							<th>Bot</th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="item in filtered" :key="item.id">
							<td>
								<button class="team-name contact-name-btn" type="button" title="Ir al chat" @click="goToChat(item)">
									<span class="team-mark">{{ item.name.slice(0, 1) }}</span><b>{{ item.name }}</b>
								</button>
							</td>
							<td>{{ item.phone || '—' }}</td>
							<td>{{ item.email || '—' }}</td>
							<td>{{ formatDate(item.createdAt) }}</td>
							<td>{{ formatRelative(item.updatedAt) }}</td>
							<td>
								<div class="contact-tags">
									<span v-for="tag in item.tags.slice(0, 2)" :key="tag" class="contact-tag">{{ tag }}</span>
									<span v-if="item.tags.length > 2" class="contact-tag contact-tag-more">+{{ item.tags.length - 2 }}</span>
									<span v-if="!item.tags.length">—</span>
								</div>
							</td>
							<td><span class="conv-fase-badge" :style="{ '--fase-color': FASE_COLORS[item.phase] }">{{ item.phase }}</span></td>
							<td>
								<button class="kt-btn kt-btn-sm" :class="item.botPaused ? 'kt-btn-primary' : 'kt-btn-secondary'" type="button" @click="contacts.toggleBot(item.id)">
									{{ item.botPaused ? 'Reanudar bot' : 'Detener bot' }}
								</button>
							</td>
						</tr>
						<tr v-if="!filtered.length">
							<td colspan="8" class="table-empty">No hay contactos que coincidan con la búsqueda.</td>
						</tr>
					</tbody>
				</table>
			</div>
		</section>
	</section>
</template>
