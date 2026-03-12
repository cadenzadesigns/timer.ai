const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const rootModules = path.resolve(workspaceRoot, 'node_modules');

const config = getDefaultConfig(projectRoot);

// Watch monorepo packages so Metro can resolve @timer-ai/core
config.watchFolders = [workspaceRoot];

// Look for modules in both local and root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  rootModules,
];

config.resolver.disableHierarchicalLookup = false;
config.resolver.sourceExts = ['tsx', 'ts', 'jsx', 'js', 'json', 'cjs', 'mjs'];

// Shims and singletons
const shimsDir = path.resolve(projectRoot, 'shims');
const REDIRECTS = {
  // Shim react-dom for @clerk/clerk-js (it's a web SDK dep that doesn't work in RN)
  'react-dom': path.resolve(shimsDir, 'react-dom.js'),
  'react-dom/client': path.resolve(shimsDir, 'react-dom-client.js'),
  'react-dom/server': path.resolve(shimsDir, 'react-dom.js'),
  // Force singleton React from root node_modules
  'react': path.resolve(rootModules, 'react/index.js'),
  'react/jsx-runtime': path.resolve(rootModules, 'react/jsx-runtime.js'),
  'react/jsx-dev-runtime': path.resolve(rootModules, 'react/jsx-dev-runtime.js'),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Exact match redirects (shims + singletons)
  if (REDIRECTS[moduleName]) {
    return { type: 'sourceFile', filePath: REDIRECTS[moduleName] };
  }

  // Catch react-dom/* subpath imports
  if (moduleName.startsWith('react-dom/')) {
    return { type: 'sourceFile', filePath: path.resolve(shimsDir, 'react-dom.js') };
  }

  // Rewrite .js imports to try .ts first (for workspace TS packages)
  if (moduleName.endsWith('.js')) {
    const tsName = moduleName.replace(/\.js$/, '.ts');
    try {
      return context.resolveRequest(context, tsName, platform);
    } catch {}
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
