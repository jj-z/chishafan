<template>
    <div class="dish-page">
        <van-search v-model="searchKeyword" placeholder="请输入搜索关键词" />
        <dish-card v-for="dish in dishes" :key="dish.id" :dish="dish"  @click="onDishClick" />
    </div>
    <tab-bar />
</template>
<script setup lang="ts">
import TabBar from '@/components/TabBar.vue';
import DishCard from '@/components/DishCard.vue';
import { dishes } from '@chisha/mock';
import { ref } from 'vue';
const searchKeyword = ref<string>('');
const onDishClick = (dish: any) => {
    console.log('点击了菜品:', dish.name);
}

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