// https://docs.expo.dev/versions/v57.0.0/config/metro/
const path = require('node:path');

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/**
 * The API server lives in `server/` inside this repo, and Metro crawls the whole
 * project root.
 *
 * Without this it walks `server/node_modules` on every start — thousands of files
 * it will never bundle — and resolves duplicate copies of packages that exist on
 * both sides. Blocking the directory costs nothing: no mobile code imports from
 * `server/`, and none should.
 */
const serverDir = path.resolve(__dirname, 'server');
config.resolver.blockList = [
  new RegExp(`^${serverDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\${path.sep}.*$`),
];

// Point react-native-svg to its DOM SVG web implementation on web builds
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-svg') {
    return {
      filePath: path.resolve(__dirname, 'node_modules/react-native-svg/lib/module/ReactNativeSVG.web.js'),
      type: 'sourceFile',
    };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
