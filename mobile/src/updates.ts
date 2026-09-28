// Update check for the APK distributed through GitHub Releases. Store builds
// (App Store / Google Play) are updated by the store, so they skip this.

import { useEffect } from "react";
import { Alert, Linking, Platform } from "react-native";
import Constants from "expo-constants";
import { APP_VERSION } from "./config";
import { newerMobileRelease } from "./lib/version";

export function useUpdateCheck() {
  useEffect(() => {
    const extra = Constants.expoConfig?.extra ?? {};
    if (Platform.OS !== "android" || extra.distribution !== "github" || !extra.releasesRepo) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`https://api.github.com/repos/${extra.releasesRepo}/releases?per_page=20`, { headers: { accept: "application/vnd.github+json" } });
        if (!res.ok) return;
        const next = newerMobileRelease(await res.json(), APP_VERSION);
        if (!next) return;
        Alert.alert("Update available", `STRATA ${next.version} is available (you have ${APP_VERSION}).`, [
          { text: "Later", style: "cancel" },
          { text: "Download", onPress: () => Linking.openURL(next.apk ?? next.page) },
        ]);
      } catch {
        /* offline */
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, []);
}
