import { StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

export default function RoomsScreen() {
  return (
    <SafeAreaProvider style={{ backgroundColor: "#1d1d1dff" }}>
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.comingSoon}>Coming Soon</Text>
          <Text style={styles.title}>Rooms</Text>
          <Text style={styles.description}>
            Rooms are dedicated, organized spaces for conversations, files, and
            tools focused on a specific topic, project, or team.
          </Text>
          <Text style={styles.description}>
            Think of it as a virtual room where people can collaborate
            efficiently, with everything they need in one place.
          </Text>
          <View style={styles.featureContainer}>
            <Text style={styles.featureTitle}>Features</Text>
            <View style={styles.feature}>
              <Text style={styles.featureIcon}>🌐</Text>
              <View style={styles.featureText}>
                <Text style={styles.featureLabel}>Public Rooms</Text>
                <Text style={styles.featureDescription}>
                  Open to all — anyone can join and participate
                </Text>
              </View>
            </View>
            <View style={styles.feature}>
              <Text style={styles.featureIcon}>🔒</Text>
              <View style={styles.featureText}>
                <Text style={styles.featureLabel}>Private Rooms</Text>
                <Text style={styles.featureDescription}>
                  Invite-only access to keep information focused and secure
                </Text>
              </View>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1d1d1dff",
    padding: 24,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  comingSoon: {
    color: "#6b9fffff",
    fontSize: 14,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: 8,
  },
  title: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 24,
  },
  description: {
    color: "#b6b6b6ff",
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 16,
  },
  featureContainer: {
    marginTop: 32,
    width: "100%",
  },
  featureTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
    textAlign: "center",
  },
  feature: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#2a2a2aff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  featureIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  featureText: {
    flex: 1,
  },
  featureLabel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  featureDescription: {
    color: "#888",
    fontSize: 14,
    lineHeight: 20,
  },
});
