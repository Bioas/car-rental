<template>
  <router-link
    v-if="!admin || auth.isAdmin"
    :to="to"
    :class="[
      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group relative',
      isActive
        ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
    ]"
  >
    <span class="flex-shrink-0"><slot /></span>
    <span v-if="!collapsed" class="truncate">{{ label }}</span>
    <div v-if="collapsed" class="absolute left-full ml-2 px-2.5 py-1.5 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 shadow-lg">
      {{ label }}
    </div>
  </router-link>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const props = defineProps({
  to: Object,
  label: String,
  collapsed: Boolean,
  admin: { type: Boolean, default: false }
})

const route = useRoute()
const auth = useAuthStore()

const isActive = computed(() => {
  if (props.to.name === route.name) return true
  if (route.path.startsWith('/admin') && props.to.name?.startsWith('Admin')) return true
  return false
})
</script>
