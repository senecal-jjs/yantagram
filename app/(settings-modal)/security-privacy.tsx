import { BackButton } from "@/components/ui/back-button";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function SecurityPrivacyScreen() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <View style={{ alignSelf: "flex-start", marginBottom: 20 }}>
        <BackButton onPress={() => router.back()} />
      </View>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <View style={styles.headerRow}>
            <IconSymbol
              name="exclamationmark.triangle.fill"
              size={22}
              color="red"
              style={styles.icon}
            />
            <Text style={styles.header}>Panic Mode</Text>
          </View>
          <Text style={styles.body}>
            Triple tap the panic button to instantly delete all messages on your
            device, along with your identity. This action is irreversible.
          </Text>
        </View>
        <View style={styles.section}>
          <View style={styles.headerRow}>
            <Ionicons
              name="lock-closed-outline"
              size={22}
              color="#5766b1"
              style={styles.icon}
            />
            <Text style={styles.header}>End-to-End Encryption</Text>
          </View>
          <Text style={styles.body}>
            Your messages are encrypted before they leave your device and can
            only be read by you and your intended recipients. No one else, not
            even the app developers, can read your messages.
          </Text>
        </View>
        <View style={styles.section}>
          <View style={styles.headerRow}>
            <Ionicons
              name="person-circle-outline"
              size={22}
              color="#5766b1"
              style={styles.icon}
            />
            <Text style={styles.header}>Private Identity</Text>
          </View>
          <Text style={styles.body}>
            You control your own nickname and identity. Your information is
            stored only on your device, not on a central server.
          </Text>
        </View>
        <View style={styles.section}>
          <View style={styles.headerRow}>
            <Ionicons
              name="cloud-offline-outline"
              size={22}
              color="#5766b1"
              style={styles.icon}
            />
            <Text style={styles.header}>No Central Servers</Text>
          </View>
          <Text style={styles.body}>
            The app does not rely on a central server to store or relay your
            messages. This means Yantagram can never be forced to hand over your
            data. This is different than a centralized system like iMessage that
            may store messages on their servers, depending on settings like
            iCloud Backup.
          </Text>
        </View>
        <View style={styles.section}>
          <View style={styles.headerRow}>
            <Ionicons
              name="alert-circle-outline"
              size={22}
              color="#ffb300"
              style={styles.icon}
            />
            <Text style={styles.header}>Your Responsibility</Text>
          </View>
          <Text style={styles.body}>
            For your safety, keep your device secure. If you lose your device,
            your messages and identity cannot be recovered. The app&apos;s
            security has not been fully audited—use at your own discretion.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    padding: 20,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  section: {
    marginBottom: 28,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  icon: {
    marginRight: 8,
  },
  header: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#fff",
  },
  body: {
    color: "#fff",
    fontSize: 15,
    lineHeight: 22,
    marginLeft: 30,
  },
});
