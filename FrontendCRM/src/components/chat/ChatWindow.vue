<script setup lang="ts">
import { nextTick, ref } from 'vue';
import type { ChatMessage, Conversation } from '@/views/ChatsLead.vue';

defineProps<{ conversation: Conversation; messages: ChatMessage[]; detailsOpen: boolean }>();
const avatarUrls = import.meta.glob('../../assets/media/avatars/*', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const emit = defineEmits<{ send: [text: string]; 'toggle-details': [] }>();
const draft = ref('');
const messageList = ref<HTMLElement>();

async function submitMessage() {
	if (!draft.value.trim()) return;
	emit('send', draft.value);
	draft.value = '';
	await nextTick();
	messageList.value?.scrollTo({ top: messageList.value.scrollHeight, behavior: 'smooth' });
}
</script>

<template>
	<section class="chat-window">
		<header class="chat-window-head"><div class="chat-contact"><span class="chat-avatar"><img :src="avatarUrls[`../../assets/media/avatars/${conversation.avatar}`]" :alt="conversation.name" /><i v-if="conversation.online" /></span><div><h2>{{ conversation.name }}</h2><p><i :class="{ online: conversation.online }" />{{ conversation.online ? 'Online' : conversation.role }}</p></div></div><div class="chat-window-actions"><button title="Start voice call"><i class="ki-filled ki-phone" /></button><button title="Start video call"><i class="ki-filled ki-screen" /></button><button title="Ver detalles del contacto" type="button" :class="{ active: detailsOpen }" @click="emit('toggle-details')"><i class="ki-filled ki-address-book" /></button><button title="More options"><i class="ki-filled ki-dots-vertical" /></button></div></header>
		<div ref="messageList" class="message-list">
			<div class="date-divider"><span>FEBRUARY 22, 2026</span></div>
			<article v-for="message in messages" :key="message.id" class="message-row" :class="message.sender">
				<span v-if="message.sender === 'them'" class="chat-avatar small"><img :src="avatarUrls[`../../assets/media/avatars/${conversation.avatar}`]" :alt="conversation.name" /></span>
				<div><div class="message-bubble">{{ message.text }}</div><time>{{ message.time }}</time></div>
			</article>
			<p v-if="!messages.length" class="chat-empty">Start a conversation with {{ conversation.name }}.</p>
		</div>
		<form class="message-composer" @submit.prevent="submitMessage"><button type="button" title="Attach file"><i class="ki-filled ki-paper-clip" /></button><input v-model="draft" type="text" :placeholder="`Message ${conversation.name}...`" /><button class="send-button" type="submit" title="Enviar mensaje"><i class="ki-filled ki-paper-plane" /></button></form>
	</section>
</template>
