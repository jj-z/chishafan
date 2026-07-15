<template>
  <router-view v-slot="{ Component }">
    <keep-alive :include="keepaliveList">
      <component :is="Component" />
    </keep-alive>
  </router-view>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useKeepaliveStore } from '@chisha/core'

const keepaliveStore = useKeepaliveStore()
const { keepaliveList } = storeToRefs(keepaliveStore)
// keepaliveList 现在是响应式 ref，store 变化会自动驱动视图更新
</script>