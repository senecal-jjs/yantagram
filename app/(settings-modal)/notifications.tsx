import { BackButton } from "@/components/ui/back-button";
import {
    NotificationContentOption,
    useSettings,
} from "@/contexts/settings-context";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";

const CONTENT_OPTIONS: {
  value: NotificationContentOption;
  label: string;
  description: string;
}[] = [
  {
    value: "nameAndContent",
    label: "Name and Content",
    description: "Show sender name and message preview",
  },
  {
    value: "nameOnly",
    label: "Name Only",
    description: "Show only sender name with 'New message'",
  },
];

export default function NotificationsScreen() {
  const { settings, updateSetting } = useSettings();
  const router = useRouter();

  const handleContentOptionChange = async (
    value: NotificationContentOption,
  ) => {
    await updateSetting("notificationContent", value);
  };

  const handleNotificationsToggle = async (enabled: boolean) => {
    await updateSetting("notificationsEnabled", enabled);
  };

  return (
    <View style={styles.container}>
      <View style={{ alignSelf: "flex-start", marginBottom: 20 }}>
        <BackButton onPress={() => router.back()} />
      </View>
      <Text style={styles.title}>Notifications</Text>
      <Text style={styles.description}>
        Configure how you receive notifications for new messages.
      </Text>

      {/* Enable/Disable Notifications */}
      <View style={styles.toggleRow}>
        <View style={styles.toggleTextContainer}>
          <Text style={styles.toggleLabel}>Enable Notifications</Text>
          <Text style={styles.toggleDescription}>
            Receive notifications when new messages arrive
          </Text>
        </View>
        <Switch
          value={settings.notificationsEnabled}
          onValueChange={handleNotificationsToggle}
          trackColor={{ false: "#444", true: "#5766b1" }}
          thumbColor="#fff"
        />
      </View>

      {/* Notification Content Section */}
      {settings.notificationsEnabled && (
        <>
          <Text style={styles.sectionHeader}>Notification Content</Text>
          <View style={styles.optionsContainer}>
            {CONTENT_OPTIONS.map((option, index) => (
              <Pressable
                key={option.value}
                style={({ pressed }) => [
                  styles.optionItem,
                  index === 0 && styles.optionItemTop,
                  index === CONTENT_OPTIONS.length - 1 &&
                    styles.optionItemBottom,
                  pressed && styles.optionPressed,
                ]}
                onPress={() => handleContentOptionChange(option.value)}
              >
                <View style={styles.optionContent}>
                  <View style={styles.optionTextContainer}>
                    <Text style={styles.optionLabel}>{option.label}</Text>
                    <Text style={styles.optionDescription}>
                      {option.description}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.radioOuter,
                      settings.notificationContent === option.value &&
                        styles.radioOuterSelected,
                    ]}
                  >
                    {settings.notificationContent === option.value && (
                      <View style={styles.radioInner} />
                    )}
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        </>
      )}
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
    marginBottom: 24,
  },
  sectionHeader: {
    color: "#888",
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    marginTop: 24,
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1d1d1d",
    padding: 16,
    borderRadius: 12,
  },
  toggleTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  toggleLabel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 4,
  },
  toggleDescription: {
    color: "#888",
    fontSize: 13,
  },
  optionsContainer: {
    backgroundColor: "#1d1d1d",
    borderRadius: 12,
    overflow: "hidden",
  },
  optionItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  optionItemTop: {
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  optionItemBottom: {
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    borderBottomWidth: 0,
  },
  optionPressed: {
    backgroundColor: "#2a2a2a",
  },
  optionContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optionTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  optionLabel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 2,
  },
  optionDescription: {
    color: "#888",
    fontSize: 13,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#555",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterSelected: {
    borderColor: "#5766b1",
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#5766b1",
  },
});
