<script setup lang="ts">
import { computed, ref } from 'vue';
import ChatSidebar from '../components/chat/ChatSidebar.vue';
import ChatWindow from '../components/chat/ChatWindow.vue';

export interface Conversation {
	id: number;
	name: string;
	role: string;
	avatar: string;
	online: boolean;
	updated: string;
	preview: string;
}

export interface ChatMessage {
	id: number;
	text: string;
	time: string;
	sender: 'me' | 'them';
}

const conversations = ref<Conversation[]>([
	{ id: 1, name: 'Sarah Chen', role: 'Product Designer', avatar: '300-2.png', online: true, updated: 'Feb 22', preview: 'Also, I updated the component library wi...' },
	{ id: 2, name: 'Marcus Johnson', role: 'Engineering Lead', avatar: '300-3.png', online: true, updated: 'Feb 22', preview: "Awesome. I'll start on the virtual scroll ne..." },
	{ id: 3, name: 'Alex Rivera', role: 'Project Manager', avatar: '300-5.png', online: true, updated: 'Feb 21', preview: 'Will do!' },
	{ id: 4, name: 'Design Team', role: '8 members', avatar: '300-17.png', online: false, updated: 'Feb 20', preview: 'I can handle that. Will open a PR by EOD.' },
	{ id: 5, name: 'Priya Sharma', role: 'Marketing', avatar: '300-7.png', online: false, updated: 'Feb 19', preview: 'Will do. Thanks Priya!' },
	{ id: 6, name: 'Sprint Planning', role: '5 members', avatar: '300-8.png', online: false, updated: 'Feb 18', preview: "Great. Let's reconvene Thursday for standup." },
	{ id: 7, name: 'Sprint Planning', role: '5 members', avatar: '300-8.png', online: false, updated: 'Feb 18', preview: "Great. Let's reconvene Thursday for standup." },
]);

const messageMap = ref<Record<number, ChatMessage[]>>({
	1: [
		{ id: 1, text: 'Hey, are you available for a quick sync today?', sender: 'them', time: '7:00 AM' },
		{ id: 2, text: 'Sure! Let me wrap up this PR first. Give me 20 minutes?', sender: 'me', time: '7:30 AM' },
		{ id: 3, text: 'Perfect, no rush. Just ping me when you’re ready.', sender: 'them', time: '8:00 AM' },
		{ id: 4, text: 'Also, I updated the component library with the new button variants.', sender: 'them', time: '9:00 AM' },
	],
});

const activeId = ref(1);
const search = ref('');
const activeConversation = computed(() => conversations.value.find((conversation) => conversation.id === activeId.value) ?? conversations.value[0]);
const filteredConversations = computed(() => conversations.value.filter((conversation) => `${conversation.name} ${conversation.preview}`.toLowerCase().includes(search.value.toLowerCase())));

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
</script>

<template>
	<section class="chat-page">
		<header class="page-toolbar chat-page-heading">
			<div>
				<h1>Chat</h1>
				<p><RouterLink to="/overview">Home</RouterLink> / Chats</p>
			</div>
		</header>
		<div class="chat-layout">
			<ChatSidebar :conversations="filteredConversations" :active-id="activeId" v-model:search="search" @select="selectConversation" />
			<ChatWindow :conversation="activeConversation" :messages="messageMap[activeId] ?? []" @send="sendMessage" />
		</div>
	</section>
</template>
