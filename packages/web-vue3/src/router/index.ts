import { createRouter, createWebHistory } from 'vue-router'
import { useKeepaliveStore } from '@chisha/core'
import HomeView from '../views/HomeView.vue'


const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: {
        title: '首页',
        keepAlive: true,
        requiresAuth: false
      }
    },
    {
      path: '/dishlist',
      name: 'dishlist',
      component: () => import('../views/DishList.vue'),
      meta: {
        title: '菜品列表',
        keepAlive: true,
        requiresAuth: false
      }
    },
    {
      path: '/records',
      name: 'records',
      component: () => import('../views/RecordsView.vue'),
      meta: {
        title: '我的记录',
        keepAlive: true,
        requiresAuth: false
      }
    },
    {
      path: '/mine',
      name: 'mine',
      component: () => import('../views/MineView.vue'),
      meta: {
        title: '我的',
        keepAlive: true,
        requiresAuth: false
      }
    }
  ],
})

router.beforeEach((to, _from, next) => {
  const keepaliveStore = useKeepaliveStore()
  const { addKeepalive, keepaliveList } = keepaliveStore
  console.log('keepaliveList:', keepaliveList) // 调试输出当前缓存列表
  // 设置页面标题
  if (to.meta.title) {
    document.title = to.meta.title as string
  }
  // 处理 keep-alive 缓存：如果目标路由不在缓存列表中则添加
  if (to.meta.keepAlive && !keepaliveList.includes(to.name as string)) {
    addKeepalive(to.name as string)
  }


  if (to.meta.requiresAuth) {
    // 处理需要认证的路由 

  }
  next()
})

export default router
