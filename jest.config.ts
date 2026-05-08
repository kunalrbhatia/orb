export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  coverageThreshold: { global: { lines: 100, functions: 100, branches: 100, statements: 100 } },
  collectCoverageFrom: ['src/**/*.ts'],
  coveragePathIgnorePatterns: ['src/server.ts', 'src/main.ts'],
};
