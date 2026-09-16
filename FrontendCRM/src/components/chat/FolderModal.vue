<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { FASES } from '../../constants/fases';
import { FOLDER_ICONS, FOLDER_COLORS } from '../../constants/folders';
import { CHAT_FOLDER_FILTER_FIELDS, LEAD_TIME_BUCKETS, type ChatFolder, type ChatFolderFilterField } from '../../stores';

const props = defineProps<{ folder: ChatFolder | null; tags: string[] }>();
const emit = defineEmits<{ close: []; save: [payload: Omit<ChatFolder, 'id'>] }>();

function defaultValueFor(field: ChatFolderFilterField): string {
	if (field === 'tag') return props.tags[0] ?? '';
	if (field === 'phase') return FASES[0];
	return LEAD_TIME_BUCKETS[0];
}

const initialField: ChatFolderFilterField = props.folder?.filterField ?? 'phase';

const form = reactive({
	name: props.folder?.name ?? '',
	icon: props.folder?.icon ?? FOLDER_ICONS[0],
	color: props.folder?.color ?? FOLDER_COLORS[0],
	filterField: initialField,
	filterValue: props.folder?.filterValue ?? defaultValueFor(initialField),
});

const valueOptions = computed<string[]>(() => {
	if (form.filterField === 'tag') return props.tags;
	if (form.filterField === 'phase') return [...FASES];
	return [...LEAD_TIME_BUCKETS];
});

// Al cambiar de campo, el valor elegido para el campo anterior ya no
// aplica — se reinicia al primero disponible del campo nuevo.
watch(
	() => form.filterField,
	(field) => {
		form.filterValue = defaultValueFor(field);
	}
);

const canSave = computed(() => form.name.trim().length > 0 && form.filterValue.length > 0);

function submit() {
	if (!canSave.value) return;
	emit('save', {
		name: form.name.trim(),
		icon: form.icon,
		color: form.color,
		filterField: form.filterField,
		filterValue: form.filterValue,
	});
}
</script>

<template>
	<div class="overlay" @click.self="emit('close')">
		<div class="modal folder-modal">
			<div class="modal-head">
				<h2>{{ folder ? 'Editar carpeta' : 'Crear carpeta' }}</h2>
				<button class="icon-btn" type="button" title="Cerrar" @click="emit('close')"><i class="ki-filled ki-cross" /></button>
			</div>
			<form class="folder-form" @submit.prevent="submit">
				<label class="contact-field">
					<span>Nombre de carpeta</span>
					<input v-model="form.name" placeholder="Ej. Clientes prioritarios" autofocus />
				</label>

				<label class="contact-field">
					<span>Filtrar por</span>
					<select v-model="form.filterField">
						<option v-for="field in CHAT_FOLDER_FILTER_FIELDS" :key="field.value" :value="field.value">{{ field.label }}</option>
					</select>
				</label>

				<label class="contact-field">
					<span>Valor</span>
					<select v-model="form.filterValue" :disabled="!valueOptions.length">
						<option v-if="!valueOptions.length" value="">Todavía no hay etiquetas para elegir</option>
						<option v-for="value in valueOptions" :key="value" :value="value">{{ value }}</option>
					</select>
				</label>

				<div class="contact-field">
					<span>Ícono</span>
					<div class="icon-picker">
						<button
							v-for="icon in FOLDER_ICONS"
							:key="icon"
							type="button"
							class="icon-picker-option"
							:class="{ active: form.icon === icon }"
							:style="{ '--picker-color': form.color }"
							:title="icon"
							@click="form.icon = icon">
							<i class="ki-filled" :class="icon" />
						</button>
					</div>
				</div>

				<div class="contact-field">
					<span>Color</span>
					<div class="color-picker">
						<button
							v-for="color in FOLDER_COLORS"
							:key="color"
							type="button"
							class="color-picker-option"
							:class="{ active: form.color === color }"
							:style="{ '--picker-color': color }"
							:title="color"
							@click="form.color = color" />
					</div>
				</div>

				<div class="modal-foot">
					<button class="kt-btn kt-btn-secondary" type="button" @click="emit('close')">Cancelar</button>
					<button class="kt-btn kt-btn-primary" type="submit" :disabled="!canSave">{{ folder ? 'Guardar cambios' : 'Crear carpeta' }}</button>
				</div>
			</form>
		</div>
	</div>
</template>