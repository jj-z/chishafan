import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path:'/dishlist',
      name:'dishlist',
      component: () => import('../views/DishList.vue')
    },
    {
      path:'/records',
      name:'records',
      component: () => import('../views/RecordsView.vue')
    },
    {
      path:'/mine',
      name:'mine',
      component: () => import('../views/MineView.vue')
    }
  ],
})

export default router
