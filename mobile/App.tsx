import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Browser } from "./src/components/Browser";
import { useUpdateCheck } from "./src/updates";

export default function App() {
  useUpdateCheck();
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Browser />
    </SafeAreaProvider>
  );
}
