const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch monorepo packages so Metro can resolve @timer-ai/core
config.watchFolders = [workspaceRoot];

// Look for modules in both local and root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Prevent Metro from deduplicating react/react-native across workspaces
config.resolver.disableHierarchicalLookup = false;

// Resolve .ts/.tsx source files when imports use .js extension (ESM convention)
config.resolver.sourceExts = ['tsx', 'ts', 'jsx', 'js', 'json', 'cjs', 'mjs'];

// Resolve .ts/.tsx source files when imports use .js extension (ESM convention)
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.endsWith('.js')) {
    const tsName = moduleName.replace(/\.js$/, '.ts');
    try {
      return context.resolveRequest(context, tsName, platform);
    } catch {
      // fall through to default
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
