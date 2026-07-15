<template>
    <div class="home-page">
        <div class="header">
            <h1>欢迎来到吃啥饭</h1>
            <p>探索美食，发现新口味</p>
            <p>当前时间：{{ currentTime }},所在城市：{{ userCity }}</p>
        </div>
        <transition name="fade" mode="out-in">
            <dish-card v-if="currentDish" :key="currentDish.id" :dish="currentDish" :show-collect="true" :show-blacklist="true"
                @click="onDishClick" @collect="onDishCollect" @blacklist="onDishBlacklist" />
        </transition>
        <div class="change-button">
            <van-button type="primary" :loading="isPicking" :disabled="isPicking" @click="changeDish">换一个</van-button>
        </div>
    </div>
    <tab-bar />
</template>
<script setup lang="ts">
defineOptions({ name: 'home' })
import TabBar from '@/components/TabBar.vue';
import DishCard from '@/components/DishCard.vue';
import { ref, onMounted, nextTick } from 'vue';
import { type Dish, useRandomDish } from '@chisha/core';
import { dishes } from '@chisha/mock';

const currentTime = ref(new Date().toLocaleString().slice(0, 16)); // 获取当前时间，格式化为字符串
const userCity = ref('北京');

const { current: currentDish, pick } = useRandomDish(dishes, { mealTime: 'lunch' })
const isPicking = ref(false)

onMounted(() => {
    // 模拟获取用户城市
    fetch('http://ip-api.com/json/')
        .then(response => response.json())
        .then(data => {
            const city = data.city;
            userCity.value = city;
            console.log('通过IP获取的城市:', city);
        })
        .catch(error => console.error('IP定位失败:', error));
});
const onDishClick = (dish: Dish) => {
    console.log('点击了菜品:', dish.name);
}
const onDishCollect = (dish: Dish) => {
    console.log('收藏了菜品:', dish.name);
}
const onDishBlacklist = (dish: Dish) => {
    console.log('拉黑了菜品:', dish.name);
}
const changeDish = async () => {
    if (isPicking.value) return
    isPicking.value = true
    console.log('更换了菜品');
    const prevId = currentDish.value?.id
    console.log('[changeDish] before pick id=', prevId)
    pick()
    await nextTick()
    console.log('[changeDish] after pick id=', currentDish.value?.id)
    // 如果随机到相同项，最多再重试几次以保证视觉变化
    let attempts = 0
    while (attempts < 5 && currentDish.value?.id === prevId) {
        pick()
        attempts++
        await nextTick()
        console.log(`[changeDish] retry ${attempts}, id=`, currentDish.value?.id)
    }
    if (attempts > 0 && currentDish.value?.id === prevId) {
        console.warn('[changeDish] 未能选到不同菜品，可能候选数量太少')
    }
    // 等待动画完成后解除 loading
    setTimeout(() => {
        isPicking.value = false
    }, 180)
}
</script>
<style scoped lang="scss">
.home {
    &-page {
        padding: 20px;

        .header {
            text-align: center;
            margin-bottom: 20px;

            h1 {
                font-size: 24px;
                color: #333;
            }

            p {
                font-size: 16px;
                color: #666;
                text-align: center;

                &:last-child {
                    margin-top: 10px;
                    font-size: 14px;
                }
            }
        }
        .change-button {
            text-align: center;
            margin-top: 20px;
        }
    }
}
</style>

<style scoped>
.fade-enter-active, .fade-leave-active {
    transition: opacity 180ms ease, transform 180ms ease;
}
.fade-enter-from, .fade-leave-to {
    opacity: 0;
    transform: translateY(6px);
}
</style>