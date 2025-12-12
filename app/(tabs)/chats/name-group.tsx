import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

export default function NameGroupScreen() {
  return (
    <SafeAreaProvider>
      <SafeAreaView></SafeAreaView>
    </SafeAreaProvider>
  );
}
