/**
 * No jest config previously existed in this repo (jest-expo was a
 * devDependency but never wired up), so `npm test` had nothing to run.
 * This is deliberately minimal — just enough for the pure-logic Jinni
 * unit tests added alongside this change (intentFinder, cartMapping,
 * audio registry/player) to execute under jest-expo's RN-aware
 * transform.
 */
module.exports = {
  preset: 'jest-expo',
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
  ],
};
