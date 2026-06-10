import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',          // store math is pure — no DOM needed
    include: ['src/**/*.test.ts'],
  },
})
