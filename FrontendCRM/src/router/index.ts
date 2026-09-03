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
import ForgotPassword from '../views/ForgotPassword.vue';
import ResetPassword from '../views/ResetPassword.vue';
import AcceptInvitation from '../views/AcceptInvitation.vue';
import { useSesionStore } from '../stores/sesion';

declare module 'vue-router' {
	interface RouteMeta {
		/** Se renderiza sin sidebar ni topbar (lo mira App.vue). */
		blank?: boolean;
		/** Accesible sin sesión: login, recuperación e invitaciones. */
		publica?: boolean;
	}
}

const router = createRouter({
	history: createWebHistory(),
	routes: [
		// La raíz apunta al dashboard y NO al login: quien ya tiene sesión entra
		// directo, y a quien no la tenga lo manda al login el guard de abajo,
		// guardando el destino.
		{ path: '/', redirect: '/overview' },
		{ path: '/overview', component: DashboardOverview },
		{ path: '/sign-in', component: SignIn, meta: { blank: true, publica: true } },
		{ path: '/forgot-password', component: ForgotPassword, meta: { blank: true, publica: true } },

		// Estas dos rutas son las que el backend mete en los correos
		// (config.appBaseUrl + /reset-password?token=… y /accept-invitation?token=…).
		// Tienen que existir de verdad: antes caían en el catch-all de abajo, que
		// redirige a /overview y se come el token por el camino.
		{ path: '/reset-password', component: ResetPassword, meta: { blank: true, publica: true } },
		{ path: '/accept-invitation', component: AcceptInvitation, meta: { blank: true, publica: true } },

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

router.beforeEach(async (destino) => {
	const sesion = useSesionStore();

	// En el primer arranque main.ts ya esperó a cargarSesion(), pero el guard se
	// protege igual: si alguien navega antes de que termine, esperar es mejor que
	// decidir con el estado a medias y mandar al login a quien sí tenía sesión.
	if (sesion.cargando) await sesion.cargarSesion();

	if (destino.meta.publica) {
		// Con sesión abierta el login no pinta nada. Las de reset e invitación sí
		// siguen siendo accesibles: alguien puede llegar a ellas desde un correo
		// teniendo ya una sesión en otra pestaña.
		if (sesion.autenticado && destino.path === '/sign-in') return { path: '/overview' };
		return true;
	}

	if (!sesion.autenticado) {
		// El destino viaja en la query para volver ahí después de entrar.
		return { path: '/sign-in', query: { redirigir: destino.fullPath } };
	}

	return true;
});

export default router;
