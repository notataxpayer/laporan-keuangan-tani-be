// jest.config.js (ESM)
export default {
  testEnvironment: 'node',
  // biar Jest treat .js sebagai ESM
  extensionsToTreatAsEsm: ['.js'],
  // lokasi test
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/src/tests/**/*.test.js'
  ],
  // kita tidak transform apa pun (pure ESM)
  transform: {},
  // opsional: coverage
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/config/swagger.js'
  ],
  coverageReporters: ['text', 'lcov'],
};
