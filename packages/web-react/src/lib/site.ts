import { DATA } from '../data'
import { indexContent } from './content'

/** 页面内嵌内容的索引，模块初始化时建一次。依赖 #tj-data，只在浏览器里引用。 */
export const SITE = indexContent(DATA)
