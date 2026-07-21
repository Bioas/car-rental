<template>
  <div class="card-hover p-5 relative overflow-hidden group">
    <div :class="['absolute top-0 right-0 w-24 h-24 rounded-full opacity-5 -translate-y-8 translate-x-8 group-hover:scale-150 transition-transform duration-700', bgClass]"></div>
    <div class="flex items-start justify-between">
      <div>
        <p class="text-sm text-gray-500 dark:text-gray-400 font-body">{{ title }}</p>
        <p class="text-3xl font-bold font-heading text-gray-900 dark:text-white mt-1">{{ value ?? '-' }}</p>
      </div>
      <div :class="['w-11 h-11 rounded-xl flex items-center justify-center', iconBg]">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  title: String,
  value: [Number, String],
  color: { type: String, default: 'brand' }
})

const bgClass = computed(() => {
  const colors = { brand: 'bg-brand-600', emerald: 'bg-emerald-600', amber: 'bg-amber-600', red: 'bg-red-600' }
  return colors[props.color] || colors.brand
})

const iconBg = computed(() => {
  const colors = {
    brand: 'bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400',
    emerald: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
    red: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
  }
  return colors[props.color] || colors.brand
})
</script>
