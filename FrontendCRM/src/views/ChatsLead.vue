<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import ChatSidebar from '../components/chat/ChatSidebar.vue';
import ChatWindow from '../components/chat/ChatWindow.vue';
import ContactDetailsPanel from '../components/chat/ContactDetailsPanel.vue';

export interface SystemField {
	id: number;
	label: string;
	value: string;
}

export type EditableContactField = 'firstName' | 'lastName' | 'email' | 'phone' | 'instagram' | 'phase';

export interface Conversation {
	id: number;
	name: string;
	role: string;
	avatar: string;
	online: boolean;
	updated: string;
	preview: string;
	firstName: string;
	lastName: string;
	email: string;
	phone: string;
	instagram: string;
	phase: string;
	tags: string[];
	botPaused: boolean;
	systemFields: SystemField[];
}

export interface ChatMessage {
	id: number;
	text: string;
	time: string;
	sender: 'me' | 'them';
}

const conversations = ref<Conversation[]>([
	{
		id: 1,
		name: 'Sarah Chen',
		role: 'Product Designer',
		avatar: '300-2.png',
		online: true,
		updated: 'Feb 22',
		preview: 'Also, I updated the component library wi...',
		firstName: 'Sarah',
		lastName: 'Chen',
		email: 'sarah.chen@example.com',
		phone: '+1 415 555 0142',
		instagram: 'sarahchen.design',
		phase: 'Suscrito',
		tags: ['Cliente', 'Diseño'],
		botPaused: false,
		systemFields: [
			{ id: 1, label: 'Nombre', value: 'Sarah' },
			{ id: 2, label: 'Apellido', value: 'Chen' },
		],
	},
	{
		id: 2,
		name: 'Marcus Johnson',
		role: 'Engineering Lead',
		avatar: '300-3.png',
		online: true,
		updated: 'Feb 22',
		preview: "Awesome. I'll start on the virtual scroll ne...",
		firstName: 'Marcus',
		lastName: 'Johnson',
		email: 'marcus.johnson@example.com',
		phone: '+1 415 555 0198',
		instagram: 'marcusj.dev',
		phase: 'Fase 3',
		tags: ['Cliente', 'Prioritario'],
		botPaused: false,
		systemFields: [
			{ id: 1, label: 'Nombre', value: 'Marcus' },
			{ id: 2, label: 'Apellido', value: 'Johnson' },
		],
	},
	{
		id: 3,
		name: 'Alex Rivera',
		role: 'Project Manager',
		avatar: '300-5.png',
		online: true,
		updated: 'Feb 21',
		preview: 'Will do!',
		firstName: 'Alex',
		lastName: 'Rivera',
		email: 'alex.rivera@example.com',
		phone: '+1 415 555 0173',
		instagram: 'alexrivera.pm',
		phase: 'Inicial',
		tags: ['Lead'],
		botPaused: true,
		systemFields: [
			{ id: 1, label: 'Nombre', value: 'Alex' },
			{ id: 2, label: 'Apellido', value: 'Rivera' },
		],
	},
	{
		id: 4,
		name: 'Design Team',
		role: '8 members',
		avatar: '300-17.png',
		online: false,
		updated: 'Feb 20',
		preview: 'I can handle that. Will open a PR by EOD.',
		firstName: 'Design',
		lastName: 'Team',
		email: 'design.team@example.com',
		phone: '',
		instagram: 'peakintel.design',
		phase: 'Suscrito',
		tags: ['Interno'],
		botPaused: false,
		systemFields: [
			{ id: 1, label: 'Nombre', value: 'Design' },
			{ id: 2, label: 'Apellido', value: 'Team' },
		],
	},
	{
		id: 5,
		name: 'Priya Sharma',
		role: 'Marketing',
		avatar: '300-7.png',
		online: false,
		updated: 'Feb 19',
		preview: 'Will do. Thanks Priya!',
		firstName: 'Priya',
		lastName: 'Sharma',
		email: 'priya.sharma@example.com',
		phone: '+1 415 555 0116',
		instagram: 'priya.marketing',
		phase: 'Pensativo',
		tags: ['Lead', 'Marketing'],
		botPaused: false,
		systemFields: [
			{ id: 1, label: 'Nombre', value: 'Priya' },
			{ id: 2, label: 'Apellido', value: 'Sharma' },
		],
	},
	{
		id: 6,
		name: 'Sprint Planning',
		role: '5 members',
		avatar: '300-8.png',
		online: false,
		updated: 'Feb 18',
		preview: "Great. Let's reconvene Thursday for standup.",
		firstName: 'Sprint',
		lastName: 'Planning',
		email: 'sprint.planning@example.com',
		phone: '',
		instagram: 'peakintel.eng',
		phase: 'Suscrito',
		tags: ['Interno'],
		botPaused: false,
		systemFields: [
			{ id: 1, label: 'Nombre', value: 'Sprint' },
			{ id: 2, label: 'Apellido', value: 'Planning' },
		],
	},
	{
		id: 7,
		name: 'Sprint Planning',
		role: '5 members',
		avatar: '300-8.png',
		online: false,
		updated: 'Feb 18',
		preview: "Great. Let's reconvene Thursday for standup.",
		firstName: 'Sprint',
		lastName: 'Planning',
		email: 'sprint.planning@example.com',
		phone: '',
		instagram: 'peakintel.eng',
		phase: 'Suscrito',
		tags: ['Interno'],
		botPaused: false,
		systemFields: [
			{ id: 1, label: 'Nombre', value: 'Sprint' },
			{ id: 2, label: 'Apellido', value: 'Planning' },
		],
	},
]);

const messageMap = ref<Record<number, ChatMessage[]>>({
	1: [
		{ id: 1, text: 'Hey, are you available for a quick sync today?', sender: 'them', time: '7:00 AM' },
		{ id: 2, text: 'Sure! Let me wrap up this PR first. Give me 20 minutes?', sender: 'me', time: '7:30 AM' },
		{ id: 3, text: 'Perfect, no rush. Just ping me when you’re ready.', sender: 'them', time: '8:00 AM' },
		{ id: 4, text: 'Also, I updated the component library with the new button variants.', sender: 'them', time: '9:00 AM' },
	],
});

const route = useRoute();

// Si se llega desde un link tipo /chats?id=3 (por ejemplo, el botón
// "Ir al chat" de la página de Estado de las conversaciones), abre
// directo esa conversación en vez de la primera de la lista.
function resolveInitialId() {
	const fromQuery = Number(route.query.id);
	if (fromQuery && conversations.value.some((item) => item.id === fromQuery)) return fromQuery;
	return 1;
}

const activeId = ref(resolveInitialId());
const search = ref('');
const detailsOpen = ref(false);
const panelColumnActive = ref(false);
const activeConversation = computed(() => conversations.value.find((conversation) => conversation.id === activeId.value) ?? conversations.value[0]);
const filteredConversations = computed(() => conversations.value.filter((conversation) => `${conversation.name} ${conversation.preview}`.toLowerCase().includes(search.value.toLowerCase())));

// También reacciona si ya estás en /chats y llega un nuevo ?id= (el
// componente no se vuelve a montar al navegar dentro de la misma ruta).
watch(
	() => route.query.id,
	(value) => {
		const numId = Number(value);
		if (numId && conversations.value.some((item) => item.id === numId)) activeId.value = numId;
	}
);

function selectConversation(conversation: Conversation) {
	activeId.value = conversation.id;
}

function sendMessage(text: string) {
	if (!text.trim()) return;
	const messages = messageMap.value[activeId.value] ?? (messageMap.value[activeId.value] = []);
	messages.push({ id: Date.now(), text: text.trim(), sender: 'me', time: 'Now' });
	const conversation = conversations.value.find((item) => item.id === activeId.value);
	if (conversation) conversation.preview = text.trim();
}

function toggleDetails() {
	detailsOpen.value = !detailsOpen.value;
	if (detailsOpen.value) panelColumnActive.value = true;
}

function onPanelAfterLeave() {
	panelColumnActive.value = false;
}

function updateContactField(field: EditableContactField, value: string) {
	const conversation = activeConversation.value;
	if (conversation) conversation[field] = value;
}

function addTag(tag: string) {
	const conversation = activeConversation.value;
	if (conversation && !conversation.tags.includes(tag)) conversation.tags.push(tag);
}

function removeTag(tag: string) {
	const conversation = activeConversation.value;
	if (conversation) conversation.tags = conversation.tags.filter((item) => item !== tag);
}

function toggleBot() {
	const conversation = activeConversation.value;
	if (conversation) conversation.botPaused = !conversation.botPaused;
}

function addSystemField() {
	const conversation = activeConversation.value;
	if (conversation) conversation.systemFields.push({ id: Date.now(), label: '', value: '' });
}

function updateSystemField(id: number, key: 'label' | 'value', value: string) {
	const field = activeConversation.value?.systemFields.find((item) => item.id === id);
	if (field) field[key] = value;
}

function removeSystemField(id: number) {
	const conversation = activeConversation.value;
	if (conversation) conversation.systemFields = conversation.systemFields.filter((item) => item.id !== id);
}
</script>

<template>
	<section class="chat-page">
		<header class="page-toolbar chat-page-heading">
			<div>
				<h1>Chat</h1>
				<p><RouterLink to="/overview">Home</RouterLink> / Chats</p>
			</div>
		</header>
		<div class="chat-layout" :class="{ 'panel-open': panelColumnActive }">
			<ChatSidebar :conversations="filteredConversations" :active-id="activeId" v-model:search="search" @select="selectConversation" />
			<ChatWindow :conversation="activeConversation" :messages="messageMap[activeId] ?? []" :details-open="detailsOpen" @send="sendMessage" @toggle-details="toggleDetails" />
			<Transition name="panel-slide" @after-leave="onPanelAfterLeave">
				<ContactDetailsPanel
					v-if="detailsOpen"
					:conversation="activeConversation"
					@close="detailsOpen = false"
					@update-field="updateContactField"
					@add-tag="addTag"
					@remove-tag="removeTag"
					@toggle-bot="toggleBot"
					@add-system-field="addSystemField"
					@update-system-field="updateSystemField"
					@remove-system-field="removeSystemField" />
			</Transition>
		</div>
	</section>
</template>
