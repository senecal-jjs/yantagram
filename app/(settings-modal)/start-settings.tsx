import { BounceButton } from "@/components/ui/bounce-button";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useCredentials } from "@/contexts/credential-context";
import {
  ConnectedDevicesRepositoryToken,
  MessagesRepositoryToken,
  useRepos,
} from "@/contexts/repository-context";
import { useSettings } from "@/contexts/settings-context";
import ConnectedDevicesRepository, {
  ConnectedDevice,
} from "@/repos/specs/connected-devices-repository";
import MessagesRepository from "@/repos/specs/messages-repository";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

export default function StartSettingsScreen() {
  const { credentials, deleteMember } = useCredentials();
  const { resetSettings } = useSettings();
  const { getRepo } = useRepos();
  const messagesRepo = getRepo<MessagesRepository>(MessagesRepositoryToken);
  const connectedDevicesRepo = getRepo<ConnectedDevicesRepository>(
    ConnectedDevicesRepositoryToken,
  );
  const router = useRouter();
  const [connectedDevices, setConnectedDevices] = useState<ConnectedDevice[]>(
    [],
  );
  const [showDevicesModal, setShowDevicesModal] = useState(false);

  useEffect(() => {
    const fetchConnectedDevices = async () => {
      const devices = await connectedDevicesRepo.getAllConnected();
      // Sort by signal strength (highest/strongest first, null values at the end)
      devices.sort((a, b) => {
        if (a.lastSeenRSSI === null && b.lastSeenRSSI === null) return 0;
        if (a.lastSeenRSSI === null) return 1;
        if (b.lastSeenRSSI === null) return -1;
        return b.lastSeenRSSI - a.lastSeenRSSI; // Higher RSSI = stronger signal
      });
      setConnectedDevices(devices);
    };

    fetchConnectedDevices();

    // Refresh device count every 5 seconds
    const interval = setInterval(fetchConnectedDevices, 5000);
    return () => clearInterval(interval);
  }, [connectedDevicesRepo]);

  const getRssiLabel = (rssi: number | null) => {
    if (rssi === null) return "Unknown";
    if (rssi >= -50) return "Excellent";
    if (rssi >= -60) return "Good";
    if (rssi >= -70) return "Fair";
    return "Weak";
  };

  const getRssiColor = (rssi: number | null) => {
    if (rssi === null) return "#888";
    if (rssi >= -50) return "#4CAF50";
    if (rssi >= -60) return "#8BC34A";
    if (rssi >= -70) return "#FFC107";
    return "#FF5722";
  };

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
              console.log(error);
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
              console.log(error);
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
          <Pressable
            style={styles.meshContainer}
            onPress={() => setShowDevicesModal(true)}
          >
            <IconSymbol
              size={24}
              name="dot.radiowaves.left.and.right"
              color={"#5766b1ff"}
            />
            <View style={styles.meshBadge}>
              <Text style={styles.meshBadgeText}>
                {connectedDevices.length}
              </Text>
            </View>
          </Pressable>
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

      {/* Connected Devices Modal */}
      <Modal
        visible={showDevicesModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDevicesModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowDevicesModal(false)}
        >
          <Pressable
            style={styles.devicesModalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.devicesModalHeader}>
              <Text style={styles.devicesModalTitle}>Nearby Devices</Text>
              <Pressable onPress={() => setShowDevicesModal(false)}>
                <IconSymbol size={24} name="xmark" color="#888" />
              </Pressable>
            </View>
            <ScrollView style={styles.devicesList}>
              {connectedDevices.length === 0 ? (
                <Text style={styles.noDevicesText}>
                  No devices connected nearby
                </Text>
              ) : (
                connectedDevices.map((device) => (
                  <View key={device.id} style={styles.deviceItem}>
                    <View style={styles.deviceInfo}>
                      <IconSymbol
                        size={20}
                        name="iphone.radiowaves.left.and.right"
                        color="#5766b1ff"
                      />
                      <Text style={styles.deviceUUID} numberOfLines={1}>
                        {device.deviceUUID.substring(0, 8)}...
                      </Text>
                    </View>
                    <View style={styles.rssiContainer}>
                      <View
                        style={[
                          styles.rssiIndicator,
                          {
                            backgroundColor: getRssiColor(device.lastSeenRSSI),
                          },
                        ]}
                      />
                      <Text style={styles.rssiText}>
                        {device.lastSeenRSSI !== null
                          ? `${device.lastSeenRSSI} dBm`
                          : "N/A"}
                      </Text>
                      <Text
                        style={[
                          styles.rssiLabel,
                          { color: getRssiColor(device.lastSeenRSSI) },
                        ]}
                      >
                        {getRssiLabel(device.lastSeenRSSI)}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
  meshContainer: {
    width: 46,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 10,
  },
  meshBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: "#5766b1ff",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  meshBadgeText: {
    color: "white",
    fontSize: 11,
    fontWeight: "700",
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  devicesModalContent: {
    backgroundColor: "#2a2a2a",
    borderRadius: 16,
    width: "85%",
    maxHeight: "60%",
    padding: 20,
  },
  devicesModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  devicesModalTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
  devicesList: {
    maxHeight: 300,
  },
  noDevicesText: {
    color: "#888",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 20,
  },
  deviceItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#333",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  deviceInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  deviceUUID: {
    color: "white",
    fontSize: 14,
    marginLeft: 10,
    flex: 1,
  },
  rssiContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rssiIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rssiText: {
    color: "#888",
    fontSize: 12,
  },
  rssiLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
});
