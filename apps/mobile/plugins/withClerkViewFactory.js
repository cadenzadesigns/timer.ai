/**
 * Custom config plugin to inject ClerkViewFactory.swift into the iOS project.
 *
 * The @clerk/expo plugin sometimes fails to inject this file during prebuild
 * ("ClerkViewFactory.swift not found, skipping injection"). This plugin
 * copies it from the template and adds it to the Xcode project's build sources.
 */
const { withXcodeProject } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withClerkViewFactory(config) {
  return withXcodeProject(config, async (config) => {
    const project = config.modResults;
    const appName = config.modRequest.projectName;
    const iosDir = config.modRequest.platformProjectRoot;
    const appDir = path.join(iosDir, appName);
    const destPath = path.join(appDir, 'ClerkViewFactory.swift');

    // Copy the template if it doesn't exist
    if (!fs.existsSync(destPath)) {
      // Try to find the template in node_modules
      const templatePaths = [
        path.resolve(iosDir, '..', 'node_modules', '@clerk', 'expo', 'ios', 'templates', 'ClerkViewFactory.swift'),
        path.resolve(iosDir, '..', '..', 'node_modules', '@clerk', 'expo', 'ios', 'templates', 'ClerkViewFactory.swift'),
        path.resolve(iosDir, '..', '..', '..', 'node_modules', '@clerk', 'expo', 'ios', 'templates', 'ClerkViewFactory.swift'),
      ];

      let templatePath = null;
      for (const p of templatePaths) {
        if (fs.existsSync(p)) {
          templatePath = p;
          break;
        }
      }

      if (!templatePath) {
        console.warn('[withClerkViewFactory] Could not find ClerkViewFactory.swift template');
        return config;
      }

      fs.copyFileSync(templatePath, destPath);
      console.log('[withClerkViewFactory] Copied ClerkViewFactory.swift to', destPath);
    }

    // Check if the file is already in the Xcode project
    const hasFile = Object.values(project.pbxFileReferenceSection()).some(
      (ref) => ref && typeof ref === 'object' && ref.name === 'ClerkViewFactory.swift'
    );

    if (!hasFile) {
      // Add to the project
      const groupKey = project.findPBXGroupKey({ name: appName });
      if (groupKey) {
        project.addSourceFile(
          `${appName}/ClerkViewFactory.swift`,
          { target: project.getFirstTarget().uuid },
          groupKey
        );
        console.log('[withClerkViewFactory] Added ClerkViewFactory.swift to Xcode project');
      }
    }

    return config;
  });
};
