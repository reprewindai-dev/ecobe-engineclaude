// Test setup and global configuration
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/ecobe_test'
process.env.REDIS_URL = 'disabled'
process.env.PORT = '3001'

// Increase timeout for integration tests
jest.setTimeout(30000)

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}
