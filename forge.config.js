const path = require('path');

// Only sign/notarize when running on macOS with credentials present.
// Set APPLE_API_KEY / APPLE_API_KEY_ID / APPLE_API_ISSUER in your env
// (or a .env you source) — never commit the .p8 key.
const canSign =
  process.platform === 'darwin' &&
  process.env.APPLE_API_KEY &&
  process.env.APPLE_API_KEY_ID &&
  process.env.APPLE_API_ISSUER;

const osxSign = {
  // Pinned to the Developer ID Application cert so the App Store "Apple
  // Distribution" certs in the keychain are never picked by mistake.
  identity: 'Developer ID Application: DALTON JAMES AVERY (9DVFF5W7KK)',
  optionsForFile: () => ({
    entitlements: path.resolve(__dirname, 'entitlements.plist'),
  }),
};

const osxNotarize = {
  appleApiKey: process.env.APPLE_API_KEY,
  appleApiKeyId: process.env.APPLE_API_KEY_ID,
  appleApiIssuer: process.env.APPLE_API_ISSUER,
};

module.exports = {
  packagerConfig: {
    appBundleId: 'com.daltonavery.notedrop',
    icon: './public/assets/dockIcon',
    ...(canSign ? { osxSign, osxNotarize } : {}),
  },
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-dmg',
      config: { format: 'ULFO' },
    },
  ],
};
