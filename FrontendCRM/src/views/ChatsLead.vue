<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import ChatSidebar from '../components/chat/ChatSidebar.vue';
import ChatWindow from '../components/chat/ChatWindow.vue';
import ContactDetailsPanel from '../components/chat/ContactDetailsPanel.vue';
import { useContactsStore, type Contact, type ChatMessage, type EditableContactField } from '../stores';
import type { Fase } from '../constants/fases';

const contactsStore = useContactsStore();

const messageMap = ref<Record<number, ChatMessage[]>>({
	1: [
		{ id: 1, text: 'Hey, are you available for a quick sync today?', sender: 'them', time: '7:00 AM' },
		{ id: 2, text: 'Sure! Let me wrap up this PR first. Give me 20 minutes?', sender: 'me', time: '7:30 AM' },
		{ id: 3, text: 'Perfect, no rush. Just ping me when you’re ready.', sender: 'them', time: '8:00 AM' },
		{ id: 4, text: 'Also, I updated the component library with the new button variants.', sender: 'them', time: '9:00 AM' },
	],
});

const route = useRoute();

// Si se llega desde un link tipo /chats?id=3 (por ejemplo, desde la
// tabla de Contactos o la de Estado de conversaciones), abre directo
// esa conversación en vez de la primera de la lista.
function resolveInitialId() {
	const fromQuery = Number(route.query.id);
	if (fromQuery && contactsStore.contacts.some((item) => item.id === fromQuery)) return fromQuery;
	return contactsStore.contacts[0]?.id ?? 0;
}

const activeId = ref(resolveInitialId());
const search = ref('');
const detailsOpen = ref(false);
const panelColumnActive = ref(false);
const activeConversation = computed(() => contactsStore.contacts.find((conversation) => conversation.id === activeId.value) ?? contactsStore.contacts[0]);
const filteredConversations = computed(() => contactsStore.contacts.filter((conversation) => `${conversation.name} ${conversation.preview}`.toLowerCase().includes(search.value.toLowerCase())));

// También reacciona si ya estás en /chats y llega un nuevo ?id= (el
// componente no se vuelve a montar al navegar dentro de la misma ruta).
watch(
	() => route.query.id,
	(value) => {
		const numId = Number(value);
		if (numId && contactsStore.contacts.some((item) => item.id === numId)) activeId.value = numId;
	}
);

function selectConversation(conversation: Contact) {
	activeId.value = conversation.id;
}

function sendMessage(text: string) {
	if (!text.trim()) return;
	const messages = messageMap.value[activeId.value] ?? (messageMap.value[activeId.value] = []);
	messages.push({ id: Date.now(), text: text.trim(), sender: 'me', time: 'Now' });
	const conversation = contactsStore.contacts.find((item) => item.id === activeId.value);
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
	contactsStore.updateContactField(activeId.value, field, value);
}

function updatePhase(phase: Fase) {
	contactsStore.updatePhase(activeId.value, phase);
}

function addTag(tag: string) {
	contactsStore.addTag(activeId.value, tag);
}

function removeTag(tag: string) {
	contactsStore.removeTag(activeId.value, tag);
}

function toggleBot() {
	contactsStore.toggleBot(activeId.value);
}

function addSystemField() {
	contactsStore.addSystemField(activeId.value);
}

function updateSystemField(id: number, key: 'label' | 'value', value: string) {
	contactsStore.updateSystemField(activeId.value, id, key, value);
}

function removeSystemField(id: number) {
	contactsStore.removeSystemField(activeId.value, id);
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
			<ChatSidebar :conversations="filteredConversations" :all-conversations="contactsStore.contacts" :active-id="activeId" v-model:search="search" @select="selectConversation" />
			<ChatWindow :conversation="activeConversation" :messages="messageMap[activeId] ?? []" :details-open="detailsOpen" @send="sendMessage" @toggle-details="toggleDetails" />
			<Transition name="panel-slide" @after-leave="onPanelAfterLeave">
				<ContactDetailsPanel
					v-if="detailsOpen"
					:conversation="activeConversation"
					@close="detailsOpen = false"
					@update-field="updateContactField"
					@update-phase="updatePhase"
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