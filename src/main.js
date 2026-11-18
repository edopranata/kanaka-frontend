import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import router from './router'
import stackTable from './directives/stackTable'
import { installErrorReporter } from './utils/errorReporter'

const app = createApp(App).use(createPinia()).use(router).directive('stack', stackTable)
installErrorReporter(app)
app.mount('#app')
