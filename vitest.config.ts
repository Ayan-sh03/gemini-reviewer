import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true, // Use global APIs like describe, it, expect
    environment: 'node', // Specify the test environment
    // Add any other specific configurations here
  },
});