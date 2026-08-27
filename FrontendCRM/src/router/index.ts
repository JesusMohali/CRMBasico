import { createRouter, createWebHistory } from 'vue-router';
import DashboardOverview from '../components/dashboard/DashboardOverview.vue';
import SectionView from '../views/SectionView.vue';
import ChatsLead from '../views/ChatsLead.vue';

const router = createRouter({
	history: createWebHistory(),
	routes: [
		{ path: '/', redirect: '/overview' },
		{ path: '/overview', component: DashboardOverview },
		{ path: '/public-profile', component: SectionView, props: { title: 'Public Profile' } },
		{ path: '/chats', component: ChatsLead },
		{ path: '/profiles', component: SectionView, props: { title: 'Profiles' } },
		{ path: '/projects', component: SectionView, props: { title: 'Projects' } },
		{ path: '/works', component: SectionView, props: { title: 'Works' } },
		{ path: '/teams', component: SectionView, props: { title: 'Teams' } },
		{ path: '/my-account', component: SectionView, props: { title: 'My Account' } },
		{ path: '/billing', component: SectionView, props: { title: 'Billing' } },
		{ path: '/security', component: SectionView, props: { title: 'Security' } },
		{ path: '/members-roles', component: SectionView, props: { title: 'Members & Roles' } },
		{ path: '/network', component: SectionView, props: { title: 'Network' } },
		{ path: '/network/get-started', component: SectionView, props: { title: 'Get Started' } },
		{ path: '/network/user-cards', component: SectionView, props: { title: 'User Cards' } },
		{ path: '/network/user-table', component: SectionView, props: { title: 'User Table' } },
		{ path: '/:pathMatch(.*)*', redirect: '/overview' },
	],
});

export default router;
