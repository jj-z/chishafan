<template>
  <van-tabbar v-model="active" route>
    <van-tabbar-item
      v-for="item in VUE3_TAB_BAR_CONFIG"
      :key="item.key"
      :to="item.path"
      :icon="item.icon"
    >
      {{ item.label }}
    </van-tabbar-item>
  </van-tabbar>
</template>
<script setup lang="ts">
import { VUE3_TAB_BAR_CONFIG } from '@/constants/tabbar';
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const active = ref(0);

// 同步路由高亮
const pathList = VUE3_TAB_BAR_CONFIG.map(item => item.path);
watch(
  () => route.path,
  (newPath) => {
    const idx = pathList.indexOf(newPath);
    if (idx !== -1) active.value = idx;
  },
  { immediate: true }
);
</script>