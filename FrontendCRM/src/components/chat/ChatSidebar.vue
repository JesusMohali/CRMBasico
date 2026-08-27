<script setup lang="ts">
import type { Conversation } from '@/views/ChatsLead.vue';

defineProps<{ conversations: Conversation[]; activeId: number }>();
const avatarUrls = import.meta.glob('../../assets/media/avatars/*', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const search = defineModel<string>('search', { required: true });
const emit = defineEmits<{ select: [conversation: Conversation] }>();
</script>

<template>
	<aside class="chat-sidebar">
		<div class="chat-sidebar-head"><div><p class="eyebrow">Messages</p><h2>Conversations</h2></div><button class="chat-icon-button" title="More options"><i class="ki-filled ki-dots-vertical" /></button></div>
		<label class="chat-search"><i class="ki-filled ki-magnifier" /><input v-model="search" type="search" placeholder="Search conversations..." /></label>
		<div class="conversation-list">
			<button v-for="conversation in conversations" :key="conversation.id" class="conversation-item" :class="{ active: conversation.id === activeId }" @click="emit('select', conversation)">
				<span class="chat-avatar"><img :src="avatarUrls[`../../assets/media/avatars/${conversation.avatar}`]" :alt="conversation.name" /><i v-if="conversation.online" /></span>
				<span class="conversation-copy"><strong>{{ conversation.name }}</strong><small>{{ conversation.preview }}</small></span>
				<time>{{ conversation.updated }}</time>
			</button>
			<p v-if="!conversations.length" class="chat-empty">No conversations found.</p>
		</div>
	</aside>
</template>
