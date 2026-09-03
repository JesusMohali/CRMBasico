<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Conversation } from '@/views/ChatsLead.vue';
import { useChatFoldersStore, useConfirmStore, recencyBucket, type ChatFolder } from '../../stores';
import FolderModal from './FolderModal.vue';

const props = defineProps<{ conversations: Conversation[]; allConversations: Conversation[]; activeId: number }>();
const avatarUrls = import.meta.glob('../../assets/media/avatars/*', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const search = defineModel<string>('search', { required: true });
const emit = defineEmits<{ select: [conversation: Conversation] }>();

const chatFolders = useChatFoldersStore();
const confirmStore = useConfirmStore();

const availableTags = computed(() => {
	const set = new Set<string>();
	props.allConversations.forEach((conversation) => conversation.tags.forEach((tag) => set.add(tag)));
	return [...set].sort();
});

function matchesFolder(conversation: Conversation, folder: ChatFolder) {
	if (folder.filterField === 'tag') return conversation.tags.includes(folder.filterValue);
	if (folder.filterField === 'phase') return conversation.phase === folder.filterValue;
	return recencyBucket(conversation.updatedAt) === folder.filterValue;
}

interface FolderGroup {
	id: number;
	name: string;
	icon: string;
	color: string;
	isDefault: boolean;
	filterField?: ChatFolder['filterField'];
	filterValue?: string;
	conversations: Conversation[];
}

// El id 0 queda reservado para "Todos" (siempre existe, no es editable);
// las carpetas reales del store empiezan en 1.
const folderGroups = computed<FolderGroup[]>(() => [
	{ id: 0, name: 'Todos', icon: 'ki-messages', color: '#635bff', isDefault: true, conversations: props.conversations },
	...chatFolders.folders.map((folder) => ({
		...folder,
		isDefault: false,
		conversations: props.conversations.filter((conversation) => matchesFolder(conversation, folder)),
	})),
]);

const expandedIds = ref<Set<number>>(new Set([0]));
function isExpanded(id: number) {
	return expandedIds.value.has(id);
}
function toggleGroup(id: number) {
	const next = new Set(expandedIds.value);
	if (next.has(id)) next.delete(id);
	else next.add(id);
	expandedIds.value = next;
}

const dotsMenuOpen = ref(false);
const dotsMenu = ref<HTMLElement>();
function closeDotsMenu(event: MouseEvent) {
	if (dotsMenu.value && !dotsMenu.value.contains(event.target as Node)) dotsMenuOpen.value = false;
}
onMounted(() => document.addEventListener('click', closeDotsMenu));
onBeforeUnmount(() => document.removeEventListener('click', closeDotsMenu));

const folderModalOpen = ref(false);
const editingFolder = ref<ChatFolder | null>(null);

function openCreateFolder() {
	editingFolder.value = null;
	folderModalOpen.value = true;
	dotsMenuOpen.value = false;
}

function openEditFolder(group: FolderGroup) {
	if (group.isDefault || !group.filterField || !group.filterValue) return;
	editingFolder.value = {
		id: group.id,
		name: group.name,
		icon: group.icon,
		color: group.color,
		filterField: group.filterField,
		filterValue: group.filterValue,
	};
	folderModalOpen.value = true;
}

function handleFolderSave(payload: Omit<ChatFolder, 'id'>) {
	if (editingFolder.value) chatFolders.updateFolder(editingFolder.value.id, payload);
	else chatFolders.addFolder(payload);
	folderModalOpen.value = false;
}

async function handleFolderDelete(id: number) {
	const confirmed = await confirmStore.ask({
		title: 'Eliminar carpeta',
		message: 'Los chats no se borran, solo dejan de estar agrupados acá.',
		confirmText: 'Eliminar',
		danger: true,
	});
	if (confirmed) {
		expandedIds.value.delete(id);
		chatFolders.removeFolder(id);
	}
}
</script>

<template>
	<aside class="chat-sidebar">
		<div class="chat-sidebar-head">
			<div><p class="eyebrow">Messages</p><h2>Conversations</h2></div>
			<div ref="dotsMenu" class="kt-menu date-menu chat-options-menu">
				<button class="chat-icon-button" title="More options" type="button" @click.stop="dotsMenuOpen = !dotsMenuOpen"><i class="ki-filled ki-dots-vertical" /></button>
				<Transition name="menu-pop">
					<div v-if="dotsMenuOpen" class="kt-menu-dropdown date-dropdown chat-options-dropdown">
						<button class="date-option" type="button" @click="openCreateFolder"><i class="ki-filled ki-folder-added" /> Crear carpeta</button>
					</div>
				</Transition>
			</div>
		</div>
		<label class="chat-search"><i class="ki-filled ki-magnifier" /><input v-model="search" type="search" placeholder="Search conversations..." /></label>

		<div class="conversation-list">
			<div v-for="group in folderGroups" :key="group.id" class="folder-group">
				<div class="folder-group-head">
					<button class="folder-group-toggle" type="button" @click="toggleGroup(group.id)">
						<i class="ki-filled" :class="group.icon" :style="{ color: group.color }" />
						<span>{{ group.name }}</span>
						<small>{{ group.conversations.length }}</small>
						<i class="ki-filled folder-chevron" :class="isExpanded(group.id) ? 'ki-up' : 'ki-down'" />
					</button>
					<div v-if="!group.isDefault" class="folder-group-actions">
						<button class="icon-btn" type="button" title="Editar carpeta" @click.stop="openEditFolder(group)"><i class="ki-filled ki-setting-3" /></button>
						<button class="icon-btn" type="button" title="Eliminar carpeta" @click.stop="handleFolderDelete(group.id)"><i class="ki-filled ki-trash" /></button>
					</div>
				</div>
				<div v-if="isExpanded(group.id)" class="folder-group-chats">
					<button v-for="conversation in group.conversations" :key="conversation.id" class="conversation-item" :class="{ active: conversation.id === activeId }" @click="emit('select', conversation)">
						<span class="chat-avatar"><img :src="avatarUrls[`../../assets/media/avatars/${conversation.avatar}`]" :alt="conversation.name" /><i v-if="conversation.online" /></span>
						<span class="conversation-copy"><strong>{{ conversation.name }}</strong><small>{{ conversation.preview }}</small></span>
						<time>{{ conversation.updated }}</time>
					</button>
					<p v-if="!group.conversations.length" class="chat-empty">No conversations found.</p>
				</div>
			</div>
		</div>

		<FolderModal v-if="folderModalOpen" :folder="editingFolder" :tags="availableTags" @close="folderModalOpen = false" @save="handleFolderSave" />
	</aside>
</template>