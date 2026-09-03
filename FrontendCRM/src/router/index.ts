import { createRouter, createWebHistory } from 'vue-router';
import DashboardOverview from '../components/dashboard/DashboardOverview.vue';
import SectionView from '../views/SectionView.vue';
import ChatsLead from '../views/ChatsLead.vue';
import Contacts from '../views/Contacts.vue';
import ConversationsStatus from '../views/ConversationsStatus.vue';
import AgendasAttendance from '../views/AgendasAttendance.vue';
import OpportunityDetail from '../views/OpportunityDetail.vue';
import Finance from '../views/Finance.vue';
import SignIn from '../views/SignIn.vue';

const router = createRouter({
	history: createWebHistory(),
	routes: [
		{ path: '/', redirect: '/sign-in' },
		{ path: '/overview', component: DashboardOverview },
		{ path: '/sign-in', component: SignIn, meta: { blank: true } },
		{ path: '/public-profile', component: SectionView, props: { title: 'Public Profile' } },
		{ path: '/chats', component: ChatsLead },
		{ path: '/contactos', component: Contacts },
		{ path: '/conversaciones', component: ConversationsStatus },
		{ path: '/agendas', component: AgendasAttendance },
		{ path: '/oportunidades', component: OpportunityDetail },
		{ path: '/finanzas', component: Finance },
		{ path: '/:pathMatch(.*)*', redirect: '/overview' },
	],
});

export default router;