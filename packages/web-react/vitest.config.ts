import { defineConfig } from 'vitest/config'

// 纯函数、对照与存储测试（.test.ts）保持 node 环境；组件测试（.test.tsx）用 jsdom。
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['tests/**/*.test.tsx'],
          setupFiles: ['tests/setup-dom.ts'],
        },
      },
    ],
  },
})
