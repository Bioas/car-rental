<template>
  <header class="h-16 border-b border-border-light dark:border-border-dark bg-card-light/80 dark:bg-card-dark/80 backdrop-blur-md flex items-center justify-between px-6 lg:px-8 sticky top-0 z-20">
    <div class="flex items-center gap-4">
      <button @click="app.toggleSidebar" class="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 lg:hidden">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>
      <h2 class="font-heading font-semibold text-lg text-gray-900 dark:text-white hidden sm:block">{{ pageTitle }}</h2>
    </div>

    <div class="flex items-center gap-2">
      <button @click="app.toggleDark" class="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors" :title="app.isDark ? 'โหมดสว่าง' : 'โหมดมืด'">
        <svg v-if="app.isDark" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
        <svg v-else class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
      </button>

      <router-link :to="{ name: 'Notifications' }" class="relative p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
        <span v-if="app.notificationCount > 0" class="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{{ app.notificationCount > 99 ? '99+' : app.notificationCount }}</span>
      </router-link>

      <div class="relative" v-click-outside="() => showDropdown = false">
        <button @click="showDropdown = !showDropdown" class="flex items-center gap-2 p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <div class="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/50 flex items-center justify-center">
            <span class="text-sm font-semibold text-brand-700 dark:text-brand-300 font-heading">{{ initials }}</span>
          </div>
        </button>

        <transition name="fade">
          <div v-if="showDropdown" class="absolute right-0 mt-2 w-56 card p-1 shadow-xl border border-border-light dark:border-border-dark z-50">
            <div class="px-3 py-2.5 border-b border-border-light dark:border-border-dark">
              <p class="text-sm font-medium text-gray-900 dark:text-white font-heading">{{ auth.user?.name }}</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">{{ auth.user?.email }}</p>
              <span v-if="auth.isAdmin" class="inline-block mt-1 badge badge-available text-[10px]">ผู้ดูแลระบบ</span>
            </div>
            <button @click="auth.logout" class="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg mt-1 transition-colors">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              ออกจากระบบ
            </button>
          </div>
        </transition>
      </div>
    </div>
  </header>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'

const auth = useAuthStore()
const app = useAppStore()
const route = useRoute()
const showDropdown = ref(false)

const pageTitle = computed(() => {
  const titles = {
    Dashboard: 'แดชบอร์ด',
    Cars: 'รถยนต์',
    CarDetail: 'รายละเอียดรถยนต์',
    Bookings: 'ประวัติการจอง',
    BookingCreate: 'จองรถ',
    Calendar: 'ปฏิทินการจอง',
    Notifications: 'การแจ้งเตือน',
    AdminCars: 'จัดการรถยนต์',
    AdminUsers: 'จัดการผู้ใช้',
    AdminBookings: 'จัดการคำขอยืม',
    AdminReports: 'รายงานสถิติ'
  }
  return titles[route.name] || 'ยานพาหนะ'
})

const initials = computed(() => {
  if (!auth.user?.name) return '?'
  return auth.user.name.charAt(0).toUpperCase()
})

const vClickOutside = {
  mounted(el, binding) {
    el.__clickOutside = (event) => {
      if (!el.contains(event.target)) binding.value()
    }
    document.addEventListener('click', el.__clickOutside)
  },
  unmounted(el) {
    document.removeEventListener('click', el.__clickOutside)
  }
}
</script>
