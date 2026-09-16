<script setup lang="ts">
import { useUiStore } from '../../stores';
import Sidebar from './Sidebar.vue';
import Topbar from './Topbar.vue';

const ui = useUiStore();
</script>

<template>
    <div class="app-shell">
        <Sidebar />
        <div v-if="ui.sidebarOpen" class="scrim" @click="ui.sidebarOpen = false" />

        <div class="content-shell">
            <Topbar />
            <main>
                <slot />
            </main>
        </div>
    </div>
</template>