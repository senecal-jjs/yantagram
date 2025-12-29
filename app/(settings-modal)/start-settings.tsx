import { IconSymbol } from "@/components/ui/icon-symbol";
import { useCredentials } from "@/contexts/credential-context";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

export default function StartSettingsScreen() {
  const { credentials } = useCredentials();
  const router = useRouter();

  return (
    <SafeAreaProvider style={{ backgroundColor: "#1d1d1dff" }}>
      <SafeAreaView style={styles.container}>
        <View style={styles.headerContainer}>
          <View style={styles.logoAvatar}></View>
          <Text style={styles.headerText}>Yantagram</Text>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            styles.shadow,
            pressed && styles.itemPressed,
          ]}
          onPress={() => router.push("/(settings-modal)/my-info")}
        >
          <Text style={styles.buttonText}>My Info</Text>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={styles.buttonText}>{credentials?.pseudonym}</Text>
            <IconSymbol
              name="chevron.right"
              color="white"
              size={15}
            ></IconSymbol>
          </View>
        </Pressable>

        <Text style={styles.sectionHeader}>Preferences</Text>

        <View style={[styles.preferenceContainer, styles.shadow]}>
          <Pressable
            style={({ pressed }) => [
              styles.preferenceItemTop,
              pressed && styles.itemPressed,
            ]}
          >
            <View style={[styles.preferenceContent, styles.preferenceBorder]}>
              <Text style={styles.buttonText}>Message Retention</Text>
              <IconSymbol
                name="chevron.right"
                color="white"
                size={15}
              ></IconSymbol>
            </View>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.preferenceItemBottom,
              pressed && styles.itemPressed,
            ]}
          >
            <View style={styles.preferenceContent}>
              <Text style={styles.buttonText}>Notifications</Text>
              <IconSymbol
                name="chevron.right"
                color="white"
                size={15}
              ></IconSymbol>
            </View>
          </Pressable>
        </View>

        <Text style={styles.sectionHeader}>About</Text>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            styles.shadow,
            pressed && styles.itemPressed,
          ]}
          onPress={() =>
            router.navigate({ pathname: "/(settings-modal)/security-privacy" })
          }
        >
          <Text style={styles.buttonText}>Security & Privacy</Text>
          <IconSymbol name="chevron.right" color="white" size={15}></IconSymbol>
        </Pressable>

        <Text style={styles.sectionHeader}>Danger Zone</Text>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            styles.shadow,
            pressed && styles.itemPressed,
          ]}
        >
          <Text style={styles.danger}>Delete all app data</Text>
        </Pressable>
        <View style={styles.warningContainer}>
          <Text style={styles.warningText}>
            Application security and encryption have not yet been fully audited.
            Use at your own discretion.
          </Text>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "column",
    marginTop: 20,
  },
  shadow: {
    // iOS Shadow
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,

    // Android Shadow
    elevation: 5, // Works for Android 5.0+
  },
  itemPressed: {
    backgroundColor: "rgba(93, 93, 93, 1)",
  },
  danger: {
    color: "red",
    fontSize: 14,
    fontWeight: 600,
    padding: 15,
  },
  preferenceContainer: {
    backgroundColor: "#333",
    borderRadius: 28,
    marginHorizontal: 10,
  },
  preferenceItemTop: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  preferenceItemBottom: {
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  preferenceContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 10,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  preferenceBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(93, 93, 93, 1)",
  },
  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    backgroundColor: "black",
    borderRadius: 25,
    padding: 10,
    marginBottom: 15,
  },
  headerText: {
    color: "white",
    fontWeight: 600,
    fontSize: 14,
  },
  logoAvatar: {
    width: 25,
    height: 25,
    borderRadius: 20,
    backgroundColor: "#5766b1ff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 13,
  },
  sectionHeader: {
    color: "#c1c1c1ff",
    fontSize: 16,
    marginLeft: 20,
    marginTop: 20,
    marginBottom: 10,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 25,
    backgroundColor: "#333",
    marginTop: 5,
    paddingHorizontal: 10,
    marginHorizontal: 10,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: 500,
    color: "white",
    padding: 15,
  },
  warningContainer: {
    marginTop: 40,
    padding: 12,
    backgroundColor: "#2a1a1a",
    borderRadius: 8,
    alignItems: "center",
    marginHorizontal: 10,
    marginBottom: 20,
  },
  warningText: {
    color: "#ffb300",
    fontSize: 14,
  },
});
