<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useUiStore } from '../../stores';
import logo from '@/assets/media/app/peak-logo.png';
const ui = useUiStore();
const route = useRoute();
const router = useRouter();
const expanded = ref('');
const userMenuOpen = ref(false);
type NavSection = {
	label: string;
	icon: string;
	path: string;
	children?: { label: string; path: string }[];
}
const sections: NavSection[] = [
	{ label: 'Overview', icon: 'ki-home-3', path: '/overview' },
	{ label: 'Chat', icon: 'ki-message-text', path: '/chats' },
	{ label: 'Contactos', icon: 'ki-address-book', path: '/contactos' },
	/* {
		label: 'Public Profile',
		icon: 'ki-profile-circle',
		children: [
			{ label: 'Profiles', path: '/profiles' },
			{ label: 'Projects', path: '/projects' },
			{ label: 'Works', path: '/works' },
			{ label: 'Teams', path: '/teams' },
		],
	},
	{
		label: 'My Account',
		icon: 'ki-setting-2',
		children: [
			{ label: 'Account Home', path: '/my-account' },
			{ label: 'Billing', path: '/billing' },
			{ label: 'Security', path: '/security' },
			{ label: 'Members & Roles', path: '/members-roles' },
		],
	},
	{
		label: 'Network',
		icon: 'ki-users',
		children: [
			{ label: 'Get Started', path: '/network/get-started' },
			{ label: 'User Cards', path: '/network/user-cards' },
			{ label: 'User Table', path: '/network/user-table' },
		],
	}, */
];
function toggleSection(label: string, path: string) {
	expanded.value = expanded.value === label ? '' : label;
	router.push(path);
}
function closeUserMenu(event: MouseEvent) {
	if (!(event.target as HTMLElement).closest('.sidebar-foot-wrap')) userMenuOpen.value = false;
}
function handleThemeChange(event: Event) {
	ui.setTheme((event.target as HTMLInputElement).checked);
}

function handleLogout() {
	// Aquí iría la lógica de cierre de sesión, como limpiar tokens, etc.
	// Por ahora solo redirige a la página de inicio de sesión.
	router.push('/sign-in');
}
onMounted(() => document.addEventListener('click', closeUserMenu));
onBeforeUnmount(() => document.removeEventListener('click', closeUserMenu));
</script>
<template>
	<aside class="sidebar" :class="{ 'sidebar-open': ui.sidebarOpen, 'sidebar-collapsed': ui.sidebarCollapsed }">
		<div class="brand">
			<img :src="logo" alt="Peak Intelligence" /><strong>Peak Intelligence</strong
			><button class="icon-btn close-mobile" @click="ui.sidebarOpen = false"><i class="ki-filled ki-cross" /></button
			><button class="sidebar-toggle" type="button" title="Colapsar menú" @click="ui.setSidebarCollapsed(!ui.sidebarCollapsed)"><i class="ki-filled ki-black-left-line" /></button>
		</div>
		<div class="sidebar-actions">
			<!-- <button class="kt-btn kt-btn-secondary sidebar-add"><i class="ki-filled ki-plus" /> <span>Add New</span></button
			><button class="kt-btn kt-btn-icon sidebar-search" title="Search" @click="ui.searchOpen = true"><i class="ki-filled ki-magnifier" /></button> -->
		</div>
		<nav class="sidebar-nav">
			<p class="nav-label">Pages</p>
			<div v-for="section in sections" :key="section.label" class="nav-group">
				<RouterLink
					v-if="!section.children"
					:to="section.path"
					class="nav-item"
					active-class="active">
					<span class="nav-icon"><i class="ki-filled" :class="section.icon" /></span><span class="nav-label-text">{{ section.label }}</span>
				</RouterLink>
				<button
					v-else
					class="nav-item"
					:class="{ active: route.path === section.path || section.children.some((child) => child.path === route.path) }"
					@click="toggleSection(section.label, section.path)">
					<span class="nav-icon"><i class="ki-filled" :class="section.icon" /></span><span class="nav-label-text">{{ section.label }}</span><span class="nav-arrow"><i class="ki-filled" :class="expanded === section.label ? 'ki-up' : 'ki-down'" /></span>
				</button>
				<Transition name="submenu"
					><div v-if="section.children && expanded === section.label" class="subnav">
						<RouterLink
							v-for="child in section.children"
							:key="child.path"
							:to="child.path"
							class="subnav-item"
							active-class="active">
							{{ child.label }}
						</RouterLink>
					</div></Transition
				>
			</div>
		</nav>
		<div class="sidebar-foot-wrap">
			<Transition name="menu-pop">
				<div v-if="userMenuOpen" class="user-menu kt-menu" @click.stop>
					<div class="user-menu-profile">
						<span class="avatar avatar-green">JD</span>
						<div><b>John Doe</b><small>john.doe@company.com</small></div>
						<span class="plan-badge">Pro</span>
					</div>
					<div class="user-menu-divider" />
					<button
						class="user-menu-item"
						@click="
							ui.profileOpen = true;
							userMenuOpen = false;
						">
						<i class="ki-filled ki-profile-circle" /> <b>Public Profile</b>
					</button>
					<button
						class="user-menu-item"
						@click="
							ui.profileOpen = true;
							userMenuOpen = false;
						">
						<i class="ki-filled ki-some-files" /> <b>My Profile</b>
					</button>
					<button class="user-menu-item"><i class="ki-filled ki-setting-2" /> <b>My Account</b><span>›</span></button>
					<button class="user-menu-item"><i class="ki-filled ki-message-programming" /> <b>Dev Forum</b></button>
					<button class="user-menu-item"><i class="ki-filled ki-icon" /> <b>Language</b><span class="language-badge">English</span></button>
					<div class="user-menu-divider" />
					<label class="user-menu-item theme-item"
						><i class="ki-filled ki-moon" /> <b>Dark Mode</b
						><input class="theme-switch" type="checkbox" :checked="ui.dark" @change="handleThemeChange"
					/></label>
					<button class="logout-button" @click="handleLogout">Cerrar sesión</button>
				</div>
			</Transition>
			<div class="sidebar-foot">
				<button class="user-trigger" type="button" :aria-expanded="userMenuOpen" @click.stop="userMenuOpen = !userMenuOpen">
					<span class="avatar avatar-green">JD</span><span class="user-summary"><b>John Doe</b><small>Administrator</small></span>
				</button>
				<div class="footer-actions">
					<!-- <button class="icon-btn" title="Notifications" @click="ui.notificationsOpen = true"><i class="ki-filled ki-notification-status" /></button
					> --><button class="icon-btn" title="Cerrar sesión" @click="handleLogout"><i class="ki-filled ki-exit-right" /></button>
				</div>
			</div>
		</div>
	</aside>
</template>