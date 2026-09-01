import { createRouter, createWebHistory } from 'vue-router';
import DashboardOverview from '../components/dashboard/DashboardOverview.vue';
import SectionView from '../views/SectionView.vue';
import ChatsLead from '../views/ChatsLead.vue';
import ConversationsStatus from '../views/ConversationsStatus.vue';

const router = createRouter({
	history: createWebHistory(),
	routes: [
		{ path: '/', redirect: '/overview' },
		{ path: '/overview', component: DashboardOverview },
		{ path: '/public-profile', component: SectionView, props: { title: 'Public Profile' } },
		{ path: '/chats', component: ChatsLead },
		{ path: '/conversaciones', component: ConversationsStatus },
		{ path: '/agendas', component: SectionView, props: { title: 'Agendas y asistencia' } },
		{ path: '/oportunidades', component: SectionView, props: { title: 'Detalle de oportunidades' } },
		{ path: '/finanzas', component: SectionView, props: { title: 'Finanzas' } },
		{ path: '/:pathMatch(.*)*', redirect: '/overview' },
	],
});

export default router;
