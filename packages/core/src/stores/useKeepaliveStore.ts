import { ref } from 'vue'
import { defineStore } from 'pinia'

/**
 * @description: Keepalive Store
 * @description: 用于动态管理需要缓存的页面组件列表
 * @example: 
 * 1. 在页面组件中使用 addKeepalive(name) 添加需要缓存的页面组件
 * 2. 在页面组件中使用 removeKeepalive(name) 移除不需要缓存的页面组件
 * 3. 在页面组件中使用 clearAllkeepalive() 清空所有缓存的页面组件
 *  
 */

export const useKeepaliveStore = defineStore('keepalive', () => {
    const keepaliveList = ref<string[]>(['home']);

    const addKeepalive = (name: string) => {
        if (!keepaliveList.value.includes(name)) {
            keepaliveList.value.push(name);
        }
    }

    const removeKeepalive = (name: string) => {
        const index = keepaliveList.value.indexOf(name);
        if (index !== -1) {
            keepaliveList.value.splice(index, 1);
        }
    }
    const clearAllkeepalive = () => {
        keepaliveList.value = []
    }

    return {
        keepaliveList,
        addKeepalive,
        removeKeepalive,
        clearAllkeepalive
    }
})