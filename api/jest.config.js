/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@common/(.*)$': '<rootDir>/common/$1',
    '^@modules/(.*)$': '<rootDir>/modules/$1',
    '^@config/(.*)$': '<rootDir>/config/$1',
    '^@database/(.*)$': '<rootDir>/database/$1',
  },
  collectCoverageFrom: [
    '**/*.ts',
    '!**/*.spec.ts',
    '!**/*.d.ts',
    '!main.ts',
    '!**/*.module.ts',
    '!**/orm-entity/**',
    '!**/testing/**',
    '!**/index.ts',
  ],
  coverageDirectory: '<rootDir>/../coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'cobertura'],
};
