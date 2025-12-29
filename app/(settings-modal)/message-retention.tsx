import { BackButton } from "@/components/ui/back-button";
import { useSettings } from "@/contexts/settings-context";
import { Slider } from "@miblanchard/react-native-slider";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

const MIN_MINUTES = 10;
const MAX_MINUTES = 5 * 24 * 60; // 5 days in minutes

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} hr`;
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.round((minutes % (24 * 60)) / 60);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

export default function MessageRetentionScreen() {
  const { settings, updateSetting } = useSettings();
  const router = useRouter();

  const handleRetentionChange = async (value: number | number[]) => {
    const newRetention = Array.isArray(value) ? value[0] : value;
    await updateSetting("messageRetentionMinutes", newRetention);
  };

  return (
    <View style={styles.container}>
      <View style={{ alignSelf: "flex-start", marginBottom: 20 }}>
        <BackButton onPress={() => router.back()} />
      </View>
      <Text style={styles.title}>Message Retention</Text>
      <Text style={styles.description}>
        Choose how long messages are kept before being deleted from your device.
        For the safety of Yantagram&apos;s users, messages cannot be stored
        longer than five days.
      </Text>
      <View style={styles.sliderRow}>
        <Text style={styles.label}>10 min</Text>
        <Slider
          containerStyle={styles.slider}
          minimumValue={MIN_MINUTES}
          maximumValue={MAX_MINUTES}
          step={10}
          value={settings.messageRetentionMinutes}
          onValueChange={handleRetentionChange}
          minimumTrackStyle={{ backgroundColor: "#fff" }}
          maximumTrackStyle={{ backgroundColor: "#444" }}
          trackStyle={{ backgroundColor: "#5766b1", height: 4 }}
          thumbStyle={{ backgroundColor: "#fff", width: 20, height: 20 }}
        />
        <Text style={styles.label}>5 days</Text>
      </View>
      <Text style={styles.value}>
        {formatDuration(settings.messageRetentionMinutes)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    padding: 24,
  },
  title: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "left",
    alignSelf: "flex-start",
  },
  description: {
    color: "#c1c1c1",
    fontSize: 15,
    marginBottom: 32,
  },
  sliderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  slider: {
    flex: 1,
    marginHorizontal: 12,
  },
  label: {
    color: "#fff",
    fontSize: 13,
    width: 50,
    textAlign: "center",
  },
  value: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 8,
  },
});
