import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { User } from '../types'


/**
 * @description: User Store
 * @description: 用于管理用户信息、收藏菜品和黑名单菜品
 */

export const useUserStore = defineStore('user', () => {
    const userInfo = ref<User | null>(null);
    const favoriteIds = ref<string[]>([]);
    const blacklistIds = ref<string[]>([]);

    const setUserInfo = (user: User | null) => {
        userInfo.value = user;
    }

    const setFavoriteIds = (ids: string[]) => {
        favoriteIds.value = ids;
    }

    const isFavorite = (id: string) => {
        return favoriteIds.value.includes(id);
    }

    const toggleFavoriteId = (id: string) => {
        if (!favoriteIds.value.includes(id)) {
            favoriteIds.value.push(id);
        } else {
            favoriteIds.value = favoriteIds.value.filter((favId) => favId !== id);
        }
    }

    const setBlacklistIds = (ids: string[]) => {
        blacklistIds.value = ids;
    }

    const isBlacklisted = (id: string) => {
        return blacklistIds.value.includes(id);
    }

    const toggleBlacklistId = (id: string) => {
        if (!blacklistIds.value.includes(id)) {
            blacklistIds.value.push(id);
        } else {
            blacklistIds.value = blacklistIds.value.filter((blkId) => blkId !== id);
        }
    }


    return {
        userInfo,
        favoriteIds,
        blacklistIds,
        setUserInfo,
        setFavoriteIds,
        toggleFavoriteId,
        setBlacklistIds,
        toggleBlacklistId,
        isFavorite,
        isBlacklisted
    }
})