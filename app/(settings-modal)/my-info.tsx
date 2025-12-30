import { BackButton } from "@/components/ui/back-button";
import { useCredentials } from "@/contexts/credential-context";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

export default function MyInfoScreen() {
  const { credentials, updatePseudonym } = useCredentials();
  const [pseudonym, setPseudonym] = useState(credentials?.pseudonym || "");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSave = async () => {
    setLoading(true);
    console.log("Saving pseudonym:", pseudonym);
    try {
      await updatePseudonym(pseudonym);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaProvider style={{ backgroundColor: "#1d1d1dff" }}>
      <SafeAreaView style={styles.container}>
        <View style={{ alignSelf: "flex-start", marginBottom: 20 }}>
          <BackButton onPress={() => router.back()} />
        </View>

        <View style={{ marginBottom: 24 }}>
          <Text style={styles.title}>My Info</Text>
          <Text style={styles.subTitle}>
            Your info is stored on your device only
          </Text>
        </View>

        <View>
          <Text style={styles.fieldHeader}>Nickname</Text>
          <TextInput
            style={styles.input}
            value={pseudonym}
            onChangeText={setPseudonym}
            placeholder="Enter new nickname"
            placeholderTextColor="#888"
            editable={!loading}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (!loading && pseudonym.trim()) {
                handleSave();
              }
            }}
          />
          <Text style={styles.fieldHeader}>
            This is how other users will identity you in chats.
          </Text>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#1d1d1dff",
    padding: 24,
  },
  fieldHeader: {
    color: "#b6b6b6ff",
    marginBottom: 1,
  },
  title: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "left",
    alignSelf: "flex-start",
  },
  subTitle: {
    color: "#fff",
    fontSize: 16,
  },
  input: {
    backgroundColor: "#292929",
    color: "#fff",
    borderRadius: 8,
    padding: 14,
    fontSize: 18,
    borderWidth: 1,
    borderColor: "#444",
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  button: {
    flex: 1,
    backgroundColor: "#333",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    marginHorizontal: 4,
  },
  saveButton: {
    backgroundColor: "#4caf50",
  },
  pressed: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  warningContainer: {
    marginTop: 40,
    padding: 12,
    backgroundColor: "#2a1a1a",
    borderRadius: 8,
    alignItems: "center",
  },
  warningText: {
    color: "#ffb300",
    fontSize: 14,
    textAlign: "center",
  },
});
