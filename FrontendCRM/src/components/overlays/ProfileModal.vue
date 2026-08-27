<script setup lang="ts">
import { useUiStore } from '../../stores';
const ui = useUiStore();
</script>
<template>
	<div class="overlay" @click.self="ui.profileOpen = false">
		<div class="modal profile-modal">
			<div class="profile-banner"><span class="avatar avatar-large avatar-green">JD</span><button class="icon-btn" @click="ui.profileOpen = false">×</button></div>
			<div class="profile-content">
				<h2>John Doe</h2>
				<p>Administrator · Product Operations</p>
				<button class="kt-btn kt-btn-primary" @click="ui.profileOpen = false">Edit profile</button>
			</div>
		</div>
	</div>
</template>
