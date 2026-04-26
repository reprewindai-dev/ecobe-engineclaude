module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/ecobe-dashboard/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.spec.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        // Override rootDir to allow importing files outside src/ (e.g. ecobe-dashboard tests)
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        moduleResolution: 'node',
        module: 'commonjs',
        target: 'ES2020',
        lib: ['ES2020'],
        // Do not set rootDir — let ts-jest infer it from CWD so cross-package imports work
      },
      diagnostics: {
        // Warn but don't fail on TS errors in test files (allows cross-package imports)
        warnOnly: true,
      },
    }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
}