import type { ExpoConfig } from "expo/config";
import pkg from "./package.json";

// APP_VERSION: set by CI from the release tag (mobile-vX.Y.Z).
// SOLANA_OS_URL: the Solana OS site shown on the home tab.
// APP_DISTRIBUTION: "github" (APK from GitHub Releases; the app checks there
// for updates) or "store" (App Store / Google Play handle updates).
const version = process.env.APP_VERSION || pkg.version;
const [major, minor, patch] = version.split(".").map((n: string) => parseInt(n, 10) || 0);

const config: ExpoConfig = {
  name: "Solana OS",
  slug: "solana-os",
  version,
  scheme: "solanaos",
  orientation: "default",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  backgroundColor: "#0b0b0f",
  ios: {
    bundleIdentifier: process.env.IOS_BUNDLE_ID ?? "app.solanaos.browser",
    supportsTablet: true,
    infoPlist: {
      // Media and downloads inside web pages.
      NSCameraUsageDescription: "Websites you visit can ask to use the camera (for example to scan a QR code).",
      NSMicrophoneUsageDescription: "Websites you visit can ask to use the microphone.",
    },
  },
  android: {
    package: process.env.ANDROID_PACKAGE ?? "app.solanaos.browser",
    versionCode: major * 10000 + minor * 100 + patch,
    adaptiveIcon: {
      backgroundColor: "#07080a",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    // Open shared web links in Solana OS ("Open with" / share sheet).
    intentFilters: [
      {
        action: "VIEW",
        category: ["BROWSABLE", "DEFAULT"],
        data: [{ scheme: "https" }, { scheme: "http" }],
      },
    ],
  },
  plugins: ["expo-secure-store", ["expo-splash-screen", { image: "./assets/splash-icon.png", imageWidth: 160, resizeMode: "contain", backgroundColor: "#07080a" }]],
  extra: {
    solanaOsUrl: process.env.SOLANA_OS_URL ?? "https://solos-rho.vercel.app",
    distribution: process.env.APP_DISTRIBUTION ?? "github",
    releasesRepo: "Kennyvincss/SolOS",
    ...(process.env.EAS_PROJECT_ID ? { eas: { projectId: process.env.EAS_PROJECT_ID } } : {}),
  },
};

export default config;
