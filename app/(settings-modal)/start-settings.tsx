import { BounceButton } from "@/components/ui/bounce-button";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useCredentials } from "@/contexts/credential-context";
import {
  MessagesRepositoryToken,
  useRepos,
} from "@/contexts/repository-context";
import { useSettings } from "@/contexts/settings-context";
import MessagesRepository from "@/repos/specs/messages-repository";
import { useRouter } from "expo-router";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

export default function StartSettingsScreen() {
  const { credentials, deleteMember } = useCredentials();
  const { resetSettings } = useSettings();
  const { getRepo } = useRepos();
  const messagesRepo = getRepo<MessagesRepository>(MessagesRepositoryToken);
  const router = useRouter();

  const deleteAllAppData = () => {
    Alert.alert(
      "Delete All App Data",
      "This will permanently delete all your data including your identity, messages, and settings. This action cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMember();
              await resetSettings();
              Alert.alert(
                "Data Deleted",
                "All app data has been deleted. The app will restart.",
                [
                  {
                    text: "OK",
                    onPress: () => router.replace("/"),
                  },
                ],
              );
            } catch (error) {
              Alert.alert(
                "Error",
                "Failed to delete all data. Please try again.",
              );
            }
          },
        },
      ],
    );
  };

  const deleteAllMessages = () => {
    Alert.alert(
      "Delete All Messages",
      "This will permanently delete all your messages but keep your identity and settings. This action cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await messagesRepo.deleteAll();
              Alert.alert(
                "Messages Deleted",
                "All messages have been deleted successfully.",
              );
            } catch (error) {
              Alert.alert(
                "Error",
                "Failed to delete messages. Please try again.",
              );
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaProvider style={{ backgroundColor: "#1d1d1dff" }}>
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <View style={styles.spacer} />
          <View style={styles.headerContainer}>
            <View style={styles.logoAvatar}></View>
            <Text style={styles.headerText}>Yantagram</Text>
          </View>
          <BounceButton
            onPress={() => router.back()}
            style={styles.closeButton}
          >
            <IconSymbol size={42} name="x.circle" color={"white"} />
          </BounceButton>
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
            onPress={() =>
              router.navigate({
                pathname: "/(settings-modal)/message-retention",
              })
            }
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
          onPress={deleteAllAppData}
        >
          <Text style={styles.danger}>Delete all app data</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            styles.shadow,
            pressed && styles.itemPressed,
          ]}
          onPress={deleteAllMessages}
        >
          <Text style={styles.danger}>Delete messages</Text>
        </Pressable>
        <View style={styles.warningContainer}>
          <Text style={styles.warningText}>
            Application security and encryption have not yet been fully audited.
            Use this application at your own discretion.
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
    backgroundColor: "black",
    borderRadius: 25,
    padding: 10,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  spacer: {
    width: 46, // Same width as close button to center the header
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    backgroundColor: "#333",
    justifyContent: "center",
    alignItems: "center",
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
