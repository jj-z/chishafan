<template>
    <div class="dish-page">
        <h1>Welcome to the dish Page</h1>
        <p>This is the main content of the dish page.</p>
    </div>
    <tab-bar />
</template>
<script setup lang="ts">
import TabBar from '@/components/TabBar.vue';
</script>
<style scoped lang="scss">
 .dish{
    &-page{
        padding: 20px;
        h1{
            font-size: 24px;
            color: #333;
        }
        p{
            font-size: 16px;
            color: #666;
        }
    }
 }
</style>