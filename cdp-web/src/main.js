import { createApp } from 'vue'
import App from './App.vue'
// 引入 Element Plus 和它的样式
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

const app = createApp(App)
app.use(ElementPlus) // 告诉 Vue 我们要用这套精装组件
app.mount('#app')