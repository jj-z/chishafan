<template>
    <div class="record-page">
        <h1>Welcome to the record Page</h1>
        <p>This is the main content of the record page.</p>
    </div>
    <tab-bar />
</template>
<script setup lang="ts">
defineOptions({ name: 'records' })
import TabBar from '@/components/TabBar.vue';
</script>
<style scoped lang="scss">
 .record{
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