<script setup lang="ts">
import { ref } from 'vue'
import { useUiStore } from '../../stores'
const ui = useUiStore(); const tab = ref('All')
const notifications = [{ title: 'New team invitation', text: 'Sarah invited you to Product Designers', time: '10 min ago', color: 'blue' }, { title: 'Deployment completed', text: 'Development Team deployed build #248', time: '42 min ago', color: 'green' }, { title: 'Report available', text: 'Your monthly activity report is ready', time: '2 hr ago', color: 'orange' }]
</script>
<template><div class="overlay drawer-overlay" @click.self="ui.notificationsOpen = false"><aside class="drawer kt-drawer"><div class="modal-head"><h2>Notifications</h2><button class="icon-btn" @click="ui.notificationsOpen = false">×</button></div><div class="drawer-tabs"><button v-for="name in ['All','Inbox','Team','Following']" :key="name" :class="{ active: tab === name }" @click="tab = name">{{ name }}</button></div><ul class="notification-list"><li v-for="notification in notifications" :key="notification.title"><span class="activity-dot" :class="notification.color" /><div><b>{{ notification.title }}</b><p>{{ notification.text }}</p><time>{{ notification.time }}</time></div></li></ul><div class="drawer-footer"><button class="kt-btn kt-btn-secondary">Mark all as read</button><button class="kt-btn kt-btn-primary">View all</button></div></aside></div></template>
