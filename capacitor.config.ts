import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ai.snapnext.app',
  appName: 'SnapNext AI',
  webDir: 'native-web',
  server: {
    url: 'https://snapnext.ai',
    cleartext: false,
    allowNavigation: ['snapnext.ai', 'www.snapnext.ai'],
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#0b0414',
    preferredContentMode: 'mobile',
  },
  android: {
    backgroundColor: '#0b0414',
    allowMixedContent: false,
    captureInput: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#0b0414',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0b0414',
      overlaysWebView: false,
    },
  },
};

export default config;
