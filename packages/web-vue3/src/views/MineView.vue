<template>
    <div class="mine-page">
        <div v-if="userInfo" class="profile-card">
            <h1>{{ userInfo.nickname }}</h1>
            <p>用户 ID：{{ userInfo.id }}</p>
            <p>手机号：{{ userInfo.phone }}</p>
            <p>微信：{{ userInfo.wechatId }}</p>
            <p>支付宝：{{ userInfo.alipayId }}</p>
            <p>偏好口味：{{ userInfo.preferredTastes?.join(' / ') }}</p>
            <p>创建时间：{{ formatDate(userInfo.createdAt) }}</p>
        </div>

        <div class="section-card">
            <h2>收藏菜品</h2>
            <p>共 {{ favoriteDishes.length }} 项</p>
            <ul>
                <li v-for="dish in favoriteDishes" :key="dish.id">{{ dish.name }}（{{ dish.id }}）</li>
            </ul>
        </div>

        <div class="section-card">
            <h2>黑名单菜品</h2>
            <p>共 {{ blacklistedDishes.length }} 项</p>
            <ul>
                <li v-for="dish in blacklistedDishes" :key="dish.id">{{ dish.name }}（{{ dish.id }}）</li>
            </ul>
        </div>
    </div>
    <tab-bar />
</template>
<script setup lang="ts">
defineOptions({ name: 'mine' })
import { computed, onMounted } from 'vue'
import { useUserStore } from '@chisha/core'
import { dishes, mockUserProfile } from '@chisha/mock'
import TabBar from '@/components/TabBar.vue'

const userStore = useUserStore()

const formatDate = (value?: Date) => {
    if (!value) return '未知'
    return new Date(value).toLocaleDateString('zh-CN')
}

const initUserProfile = () => {
    userStore.setUserInfo(mockUserProfile.user)
    userStore.setFavoriteIds(mockUserProfile.favoriteDishIds)
    userStore.setBlacklistIds(mockUserProfile.blacklistDishIds)
}

onMounted(() => {
    initUserProfile()
})

const userInfo = computed(() => userStore.userInfo)
const favoriteDishes = computed(() => dishes.filter((dish) => userStore.favoriteIds.includes(dish.id)))
const blacklistedDishes = computed(() => dishes.filter((dish) => userStore.blacklistIds.includes(dish.id)))
</script>
<style scoped lang="scss">
 .mine{
    &-page{
        padding: 20px 20px 80px;
        display: flex;
        flex-direction: column;
        gap: 16px;

        .profile-card,
        .section-card {
            background: #fff;
            border-radius: 12px;
            padding: 16px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
        }

        h1,
        h2 {
            margin: 0 0 8px;
            color: #333;
        }

        p,
        li {
            font-size: 14px;
            color: #666;
            margin: 4px 0;
        }

        ul {
            padding-left: 18px;
            margin: 8px 0 0;
        }
    }
 }
</style>