<template>
    <div class="home-page">
        <h1>Welcome to the Home Page</h1>
        <p>This is the main content of the home page.</p>
    </div>
    <tab-bar />
</template>
<script setup lang="ts">
import TabBar from '@/components/TabBar.vue';
</script>
<style scoped lang="scss">
 .home{
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