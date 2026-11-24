/** jsdom 没有自带类型，这里只声明对照测试用到的部分（不新增 @types 依赖）。 */
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string, options?: { runScripts?: 'dangerously' | 'outside-only'; url?: string })
    window: any
    getInternalVMContext(): import('node:vm').Context
  }
}
