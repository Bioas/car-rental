<template>
  <aside :class="[
    'fixed left-0 top-0 h-full z-30 flex flex-col border-r border-border-light dark:border-border-dark bg-card-light dark:bg-card-dark transition-all duration-300',
    app.sidebarOpen ? 'w-64' : 'w-20'
  ]">
    <div :class="['flex items-center h-16 px-4 border-b border-border-light dark:border-border-dark', app.sidebarOpen ? 'justify-between' : 'justify-center']">
      <div v-if="app.sidebarOpen" class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-xl bg-brand-600 flex items-center justify-center">
          <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div>
          <h1 class="font-heading font-semibold text-sm text-gray-900 dark:text-white">ยานพาหนะ</h1>
          <p class="text-[10px] text-gray-500 dark:text-gray-400 -mt-0.5">ระบบบริหารจัดการ</p>
        </div>
      </div>
      <div v-else class="w-8 h-8 rounded-xl bg-brand-600 flex items-center justify-center">
        <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <button v-if="app.sidebarOpen" @click="app.toggleSidebar" class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
      </button>
    </div>

    <nav class="flex-1 py-4 px-2 space-y-1 overflow-y-auto scrollbar-thin">
      <SidebarLink :to="{ name: 'Dashboard' }" :collapsed="!app.sidebarOpen" label="แดชบอร์ด">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
      </SidebarLink>

      <SidebarLink :to="{ name: 'Cars' }" :collapsed="!app.sidebarOpen" label="รถยนต์">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" /></svg>
      </SidebarLink>

      <SidebarLink :to="{ name: 'Calendar' }" :collapsed="!app.sidebarOpen" label="ปฏิทิน">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
      </SidebarLink>

      <SidebarLink :to="{ name: 'BookingCreate' }" :collapsed="!app.sidebarOpen" label="จองรถ">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
      </SidebarLink>

      <SidebarLink :to="{ name: 'Bookings' }" :collapsed="!app.sidebarOpen" label="ประวัติการจอง">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
      </SidebarLink>

      <div class="pt-4 mt-4 border-t border-border-light dark:border-border-dark">
        <p v-if="app.sidebarOpen" class="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">จัดการระบบ</p>

        <SidebarLink :to="{ name: 'AdminCars' }" :collapsed="!app.sidebarOpen" label="จัดการรถ" :admin="true">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        </SidebarLink>

        <SidebarLink :to="{ name: 'AdminUsers' }" :collapsed="!app.sidebarOpen" label="ผู้ใช้" :admin="true">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>
        </SidebarLink>

        <SidebarLink :to="{ name: 'AdminBookings' }" :collapsed="!app.sidebarOpen" label="คำขอจอง" :admin="true">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </SidebarLink>

        <SidebarLink :to="{ name: 'AdminReports' }" :collapsed="!app.sidebarOpen" label="รายงาน" :admin="true">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
        </SidebarLink>
      </div>
    </nav>

    <div v-if="!app.sidebarOpen" class="p-3 border-t border-border-light dark:border-border-dark flex justify-center">
      <button @click="app.toggleSidebar" class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
      </button>
    </div>
  </aside>
</template>

<script setup>
import SidebarLink from './SidebarLink.vue'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'

const app = useAppStore()
const auth = useAuthStore()
</script>
