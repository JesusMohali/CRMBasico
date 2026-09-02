<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router';
import { useUiStore } from './stores';
import AppLayout from './components/layout/AppLayout.vue';
import SearchModal from './components/overlays/SearchModal.vue';
import NotificationsDrawer from './components/overlays/NotificationsDrawer.vue';
import ProfileModal from './components/overlays/ProfileModal.vue';
const ui = useUiStore();
const route = useRoute();
</script>
<template>
	<template v-if="route.meta.blank">
		<RouterView />
	</template>
	<template v-else>
		<AppLayout>
			<RouterView />
		</AppLayout>
		<SearchModal v-if="ui.searchOpen" />
		<NotificationsDrawer v-if="ui.notificationsOpen" />
		<ProfileModal v-if="ui.profileOpen" />
	</template>
</template>