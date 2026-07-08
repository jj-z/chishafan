import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'

// 导入你的页面（稍后创建）
import HomeView from './views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomeView }
  ]
})

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')