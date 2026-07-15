import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import Vant from 'vant'
import 'vant/lib/index.css'
import { createPinia } from 'pinia'
const pinia = createPinia()

createApp(App).use(pinia).use(router).use(Vant).mount('#app')
