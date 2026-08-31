<script setup lang="ts">
import { ref } from 'vue';
import type { Conversation, EditableContactField } from '@/views/ChatsLead.vue';

defineProps<{ conversation: Conversation }>();
const emit = defineEmits<{
	close: [];
	'update-field': [field: EditableContactField, value: string];
	'toggle-bot': [];
	'add-tag': [tag: string];
	'remove-tag': [tag: string];
	'add-system-field': [];
	'update-system-field': [id: number, key: 'label' | 'value', value: string];
	'remove-system-field': [id: number];
}>();

const sectionsOpen = ref({ contact: true, tags: true, bot: true, system: true });
function toggleSection(key: keyof typeof sectionsOpen.value) {
	sectionsOpen.value[key] = !sectionsOpen.value[key];
}

const newTag = ref('');
function submitTag() {
	if (!newTag.value.trim()) return;
	emit('add-tag', newTag.value.trim());
	newTag.value = '';
}

function onFieldInput(field: EditableContactField, event: Event) {
	emit('update-field', field, (event.target as HTMLInputElement).value);
}

function onSystemFieldInput(id: number, key: 'label' | 'value', event: Event) {
	emit('update-system-field', id, key, (event.target as HTMLInputElement).value);
}
</script>

<template>
	<aside class="contact-panel">
		<div class="contact-panel-head">
			<h2>Detalles del contacto</h2>
			<button class="icon-btn" type="button" title="Cerrar" @click="emit('close')"><i class="ki-filled ki-cross" /></button>
		</div>
		<div class="contact-panel-body">
			<!-- Contacto -->
			<section class="contact-panel-section">
				<button class="contact-panel-section-head" type="button" @click="toggleSection('contact')">
					<i class="ki-filled ki-address-book" /><span>Contacto</span
					><i class="ki-filled" :class="sectionsOpen.contact ? 'ki-up' : 'ki-down'" />
				</button>
				<div v-if="sectionsOpen.contact" class="contact-panel-section-body">
					<label class="contact-field">
						<span>Nombre</span>
						<input :value="conversation.firstName" @input="onFieldInput('firstName', $event)" />
					</label>
					<label class="contact-field">
						<span>Apellido</span>
						<input :value="conversation.lastName" @input="onFieldInput('lastName', $event)" />
					</label>
					<label class="contact-field">
						<span><i class="ki-filled ki-sms" /> Correo</span>
						<input type="email" :value="conversation.email" @input="onFieldInput('email', $event)" />
					</label>
					<label class="contact-field">
						<span><i class="ki-filled ki-phone" /> Teléfono</span>
						<input type="tel" :value="conversation.phone" @input="onFieldInput('phone', $event)" />
					</label>
					<label class="contact-field">
						<span><i class="ki-filled ki-instagram" /> Instagram</span>
						<input :value="conversation.instagram" @input="onFieldInput('instagram', $event)" />
					</label>
					<label class="contact-field">
						<span><i class="ki-filled ki-flag" /> Fase</span>
						<input :value="conversation.phase" @input="onFieldInput('phase', $event)" />
					</label>
				</div>
			</section>

			<!-- Etiquetas -->
			<section class="contact-panel-section">
				<button class="contact-panel-section-head" type="button" @click="toggleSection('tags')">
					<i class="ki-filled ki-tag" /><span>Etiquetas</span
					><i class="ki-filled" :class="sectionsOpen.tags ? 'ki-up' : 'ki-down'" />
				</button>
				<div v-if="sectionsOpen.tags" class="contact-panel-section-body">
					<div class="tag-list">
						<span v-for="tag in conversation.tags" :key="tag" class="tag-pill"
							>{{ tag }}<button type="button" title="Quitar etiqueta" @click="emit('remove-tag', tag)"><i class="ki-filled ki-cross" /></button></span
						>
						<p v-if="!conversation.tags.length" class="contact-panel-empty">Sin etiquetas todavía.</p>
					</div>
					<form class="tag-input-row" @submit.prevent="submitTag">
						<input v-model="newTag" placeholder="Nueva etiqueta..." />
						<button class="kt-btn kt-btn-secondary" type="submit"><i class="ki-filled ki-plus" /></button>
					</form>
				</div>
			</section>

			<!-- Bot -->
			<section class="contact-panel-section">
				<button class="contact-panel-section-head" type="button" @click="toggleSection('bot')">
					<i class="ki-filled ki-technology-2" /><span>Bot</span
					><i class="ki-filled" :class="sectionsOpen.bot ? 'ki-up' : 'ki-down'" />
				</button>
				<div v-if="sectionsOpen.bot" class="contact-panel-section-body">
					<div class="bot-control">
						<span class="status" :class="conversation.botPaused ? 'pending' : 'active'">{{ conversation.botPaused ? 'Bot pausado' : 'Bot activo' }}</span>
						<button class="kt-btn" :class="conversation.botPaused ? 'kt-btn-primary' : 'kt-btn-secondary'" type="button" @click="emit('toggle-bot')">
							{{ conversation.botPaused ? 'Reanudar bot' : 'Detener bot' }}
						</button>
					</div>
					<p class="contact-panel-hint">Mientras el bot está pausado, no va a responder automáticamente en esta conversación.</p>
				</div>
			</section>

			<!-- Campos del sistema -->
			<section class="contact-panel-section">
				<button class="contact-panel-section-head" type="button" @click="toggleSection('system')">
					<i class="ki-filled ki-setting-2" /><span>Campos del sistema</span
					><i class="ki-filled" :class="sectionsOpen.system ? 'ki-up' : 'ki-down'" />
				</button>
				<div v-if="sectionsOpen.system" class="contact-panel-section-body">
					<div v-for="field in conversation.systemFields" :key="field.id" class="system-field-row">
						<input class="system-field-label" placeholder="Nombre del campo" :value="field.label" @input="onSystemFieldInput(field.id, 'label', $event)" />
						<input class="system-field-value" placeholder="Valor" :value="field.value" @input="onSystemFieldInput(field.id, 'value', $event)" />
						<button class="icon-btn" type="button" title="Quitar campo" @click="emit('remove-system-field', field.id)"><i class="ki-filled ki-trash" /></button>
					</div>
					<p v-if="!conversation.systemFields.length" class="contact-panel-empty">Todavía no hay campos del sistema.</p>
					<button class="kt-btn kt-btn-secondary" type="button" @click="emit('add-system-field')"><i class="ki-filled ki-plus" /> Añadir campo</button>
				</div>
			</section>
		</div>
	</aside>
</template>
