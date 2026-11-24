import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { tjInject } from './plugins/tj-inject'

export default defineConfig({
  plugins: [react(), tjInject(), viteSingleFile()],
})
