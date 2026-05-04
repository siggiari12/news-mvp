import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'is.vizka.app',
  appName: 'VIZKA',
  webDir: 'public', // Placeholder - we use server URL for production
  server: {
    // Production: Point to your deployed Vercel URL
    // Update this URL after deployment
    url: 'https://news-mvp.vercel.app',
    // For local development, comment out above and use:
    // url: 'http://localhost:3000',
    // cleartext: true
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#000000',
    preferredContentMode: 'mobile',
    // Allow the app to load from external URL
    allowsLinkPreview: false,
    scrollEnabled: true
  },
  android: {
    backgroundColor: '#000000',
    // Allow loading from external URL
    allowMixedContent: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#000000',
      showSpinner: false,
      launchAutoHide: true
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#000000'
    }
  }
};

export default config;
