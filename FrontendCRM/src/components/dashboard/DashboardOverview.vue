<template>
	<div class="dashboard">
		<section class="page-toolbar">
			<div>
				<h1>Dashboard</h1>
				<p><a href="#">Home</a></p>
			</div>
			<div class="toolbar-actions">
				<button class="kt-btn kt-btn-outline" type="button"><i class="ki-filled ki-exit-down" />Export</button>
				<div ref="monthMenu" class="kt-menu date-menu">
					<button class="kt-btn kt-btn-outline date-toggle" type="button" :aria-expanded="monthMenuOpen" @click.stop="monthMenuOpen = !monthMenuOpen">
						<i class="ki-filled ki-calendar" /><span>{{ month }}</span
						><i class="ki-filled ki-down" />
					</button>
					<Transition name="menu-pop">
						<div v-if="monthMenuOpen" class="kt-menu-dropdown date-dropdown">
							<button
								v-for="item in months"
								:key="item"
								class="date-option"
								:class="{ active: month === item }"
								type="button"
								@click="
									month = item;
									monthMenuOpen = false;
								">
								{{ item }}
							</button>
						</div>
					</Transition>
				</div>
			</div>
		</section>
		<section>
			<CardInfo />
		</section>
		<section class="demo-grid">
			<article class="kt-card setup-card">
				<img class="setup-image" :src="setupImage" alt="" />
				<div>
					<h2>Swift Setup for New Teams</h2>
					<p>Enhance team formation and management with easy-to-use tools for communication, task organization, and progress tracking, all in one place.</p>
					<button class="kt-btn kt-btn-primary">Create Team</button>
				</div>
			</article>
			<article class="kt-card highlights-card">
				<div class="card-head">
					<h2>Highlights</h2>
					<button class="icon-btn">•••</button>
				</div>
				<div class="highlight-total">
					<small>All time sales</small><strong>$295.7k <span>+2.7%</span></strong>
				</div>
				<div class="sales-bar"><i /><i /><i /></div>
				<div class="legend"><span>● Metronic</span><span>● Bundle</span><span>● MetronicNest</span></div>
				<ul class="sales-list">
					<li
						v-for="sale in [
							['Online Store', '$172k', '3.9%'],
							['Facebook', '$85k', '0.7%'],
							['Instagram', '$36k', '8.2%'],
							['Google', '$26k', '8.2%'],
							['Retail', '$7k', '0.7%'],
						]"
						:key="sale[0]">
						<span>{{ sale[0] }}</span
						><b
							>{{ sale[1] }} <em>{{ sale[2] }}</em></b
						>
					</li>
				</ul>
			</article>
		</section>
		<section class="demo-grid bottom-grid">
			<TeamsTable />
			<article class="kt-card block-card">
				<div class="card-head"><h2>Block List</h2></div>
				<p>Users on the block list are unable to send chat requests or messages to you.</p>
				<label class="block-input"><input placeholder="Block new user" /><button class="kt-btn kt-btn-primary">Add</button></label>
				<ul>
					<li
						v-for="person in [
							['Esther Howard', '6 commits', '1.png'],
							['Tyler Hero', '29 commits', '2.png'],
							['Arlene McCoy', '34 commits', '3.png'],
						]"
						:key="person[0]">
						<img :src="avatarUrls[`../../assets/media/avatars/gray/${person[2]}`]" alt="" />
						<div>
							<b>{{ person[0] }}</b
							><small>{{ person[1] }}</small>
						</div>
						<button class="icon-btn">⌫</button>
					</li>
				</ul>
			</article>
		</section>
		<section>
			<div id="chart">
				<Charts kind="Balance" />
			</div>
		</section>
	</div>
</template>
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import TeamsTable from './TeamsTable.vue'
import Charts from './Charts.vue'
import { useUiStore } from '../../stores'
import setupImage from '@/assets/media/illustrations/32.svg'
import CardInfo from './CardInfo.vue'
const avatarUrls = import.meta.glob('@/assets/media/avatars/gray/*', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const ui = useUiStore();
const month = ref('September, 2024')
const monthMenuOpen = ref(false)
const monthMenu = ref<HTMLElement>()
const months = [
	'January, 2024',
	'February, 2024',
	'March, 2024',
	'April, 2024',
	'May, 2024',
	'June, 2024',
	'July, 2024',
	'August, 2024',
	'September, 2024',
	'October, 2024',
	'November, 2024',
	'December, 2024',
]
function closeMonthMenu(event: MouseEvent) {
	if (monthMenu.value && !monthMenu.value.contains(event.target as Node)) monthMenuOpen.value = false;
}
onMounted(() => document.addEventListener('click', closeMonthMenu));
onBeforeUnmount(() => document.removeEventListener('click', closeMonthMenu));
</script>