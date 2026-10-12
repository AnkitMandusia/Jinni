module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./src'],
          extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
          alias: {
            '@': './src',
            '@components': './src/shared/components',
            '@navigation': './src/shared/navigation',
            '@services': './src/shared/services',
            '@store': './src/shared/store',
            '@theme': './src/shared/theme',
            '@utils': './src/shared/utils',
            '@modules': './src/modules',
            '@auth': './src/auth',
            '@shared': './src/shared',
          },
        },
      ],
      'react-native-reanimated/plugin',
    ],
  };
};
