<script setup lang="ts">
import { useUiStore } from '../../stores';
import logo from '../../assets/media/app/peak-logo.png';
const ui = useUiStore();
</script>
<template>
	<header class="topbar">
		<div class="topbar-brand"><img :src="logo" alt="Peak Intelligence" /></div>
		<button class="icon-btn mobile-menu" title="Open menu" @click="ui.sidebarOpen = true">☰</button>
		<div class="breadcrumbs"><span>Dashboards</span><b>/</b><strong>Overview</strong></div>
		<div class="top-actions">
			<button class="icon-btn" title="Search" @click="ui.searchOpen = true">⌕</button
			><button class="icon-btn notification-button" title="Notifications" @click="ui.notificationsOpen = true">♧<i /></button
			><button class="user-chip" @click="ui.profileOpen = true"><span class="avatar avatar-green">JD</span><span class="user-name">John Doe</span><span>⌄</span></button>
		</div>
	</header>
</template>
