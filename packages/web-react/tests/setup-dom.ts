import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// 未开 globals，testing-library 不会自动清理；每个用例后卸载已渲染的组件
afterEach(cleanup)
