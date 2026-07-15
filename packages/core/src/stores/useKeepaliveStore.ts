import { ref } from 'vue'
import { defineStore } from 'pinia'

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