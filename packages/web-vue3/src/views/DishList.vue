<template>
    <div class="dish-page">
        <van-search v-model="searchKeyword" placeholder="请输入搜索关键词" />
        <dish-card v-for="dish in dishesList" :key="dish.id" :dish="dish" :is-blacklisted="dish.isBlacklisted"
            :is-favorite="dish.isFavorite" @click="onDishClick" @favorite="onFavoriteClick"
            @blacklist="onBlacklistClick" />
    </div>
    <tab-bar />
</template>
<script setup lang="ts">
defineOptions({ name: 'dishlist' })
import TabBar from '@/components/TabBar.vue';
import DishCard from '@/components/DishCard.vue';
import { dishes } from '@chisha/mock';
import { ref, computed } from 'vue';
import { type Dish, useUserStore } from '@chisha/core';
const { isFavorite, isBlacklisted, toggleBlacklistId, toggleFavoriteId } = useUserStore();
const searchKeyword = ref<string>('');
const onDishClick = (dish: any) => {
    console.log('点击了菜品:', dish.name);
}
const onFavoriteClick = (dish: any) => {
    console.log('切换了收藏菜品状态:', dish.name);
    toggleFavoriteId(dish.id);
}
const onBlacklistClick = (dish: any) => {
    console.log('切换了拉黑菜品状态:', dish.name);
    toggleBlacklistId(dish.id);
}
interface DishStatus extends Dish {
    isFavorite: boolean;
    isBlacklisted: boolean;
}
const dishesList = computed<DishStatus[]>(() => {
    return dishes.map(dish => ({
        ...dish,
        isFavorite: isFavorite(dish.id),
        isBlacklisted: isBlacklisted(dish.id)
    }));
});

</script>
<style scoped lang="scss">
.dish {
    &-page {
        padding: 20px 20px 80px;

        h1 {
            font-size: 24px;
            color: #333;
        }

        p {
            font-size: 16px;
            color: #666;
        }
    }
}
</style>