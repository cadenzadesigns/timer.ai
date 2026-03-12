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

module.exports = config;
