<template>
    <div class="record-page">
        <van-tabs v-model:active="active">
            <van-tab title="收藏">
                <dish-card v-for="dish in dishesFavoriteList" :key="dish.id" :dish="dish"
                    :is-blacklisted="dish.isBlacklisted" :is-favorite="dish.isFavorite" @click="onDishClick"
                    @favorite="onFavoriteClick" @blacklist="onBlacklistClick" />
            </van-tab>
            <van-tab title="黑名单">
                <dish-card v-for="dish in dishesBlacklistList" :key="dish.id" :dish="dish"
                    :is-blacklisted="dish.isBlacklisted" :is-favorite="dish.isFavorite" @click="onDishClick"
                    @favorite="onFavoriteClick" @blacklist="onBlacklistClick" />
            </van-tab>
        </van-tabs>
    </div>
    <tab-bar />
</template>
<script setup lang="ts">
defineOptions({ name: 'records' })
import TabBar from '@/components/TabBar.vue';
import DishCard from '@/components/DishCard.vue';
import { ref, computed } from 'vue';
import { dishes } from '@chisha/mock';
import { useUserStore, type Dish } from '@chisha/core';
const { isFavorite, isBlacklisted, toggleBlacklistId, toggleFavoriteId } = useUserStore();
interface DishStatus extends Dish {
    isFavorite: boolean;
    isBlacklisted: boolean;
}
const dishesFavoriteList = computed<DishStatus[]>(() => {
    return dishes.filter(dish => isFavorite(dish.id)).map(dish => ({
        ...dish,
        isFavorite: isFavorite(dish.id),
        isBlacklisted: isBlacklisted(dish.id)
    }));
});
const dishesBlacklistList = computed<DishStatus[]>(() => {
    return dishes.filter(dish => isBlacklisted(dish.id)).map(dish => ({
        ...dish,
        isFavorite: isFavorite(dish.id),
        isBlacklisted: isBlacklisted(dish.id)
    }));
});
const active = ref(0);
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

</script>
<style scoped lang="scss">
.record {
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