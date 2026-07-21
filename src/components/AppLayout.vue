<template>
  <div class="min-h-screen flex">
    <Sidebar />
    <div :class="['flex-1 flex flex-col min-h-screen transition-all duration-300', app.sidebarOpen ? 'ml-64' : 'ml-20']">
      <Navbar />
      <main class="flex-1 p-6 lg:p-8">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<script setup>
import Sidebar from './Sidebar.vue'
import Navbar from './Navbar.vue'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { watch } from 'vue'

const app = useAppStore()
const auth = useAuthStore()

watch(() => auth.isLoggedIn, (val) => {
  if (val) app.fetchNotificationCount()
})
</script>
