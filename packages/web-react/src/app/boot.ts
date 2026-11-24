import { captureCodeFromUrl } from '../lib/api'
import { refreshMe } from './session'
import { cloudPull, purgeTrash } from './cloud'

/**
 * 启动副作用，顺序同旧页面：?k= 通行码入库（第 2562 行）→ refreshMe、cloudPull（第 3425 行）→ purgeTrash（第 3720 行）。
 * 在 React 挂载前调用一次，不放进组件 effect（StrictMode 开发期会重复执行 effect）。
 */
export function boot(): void {
  captureCodeFromUrl()
  void refreshMe()
  void cloudPull()
  purgeTrash()
}
