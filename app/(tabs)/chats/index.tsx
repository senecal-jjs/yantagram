import ConversationItem from "@/components/conversation";
import { CredentialsQR } from "@/components/credentials-qr";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { deserializeCredentialsFromQR } from "@/treekem/protocol";
import { Credentials, SerializedCredentials } from "@/treekem/types";
import { Conversation } from "@/types/global";
import { secureFetch } from "@/utils/secure-store";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

const CREDENTIALS_KEY = "treekem_credentials";

const mockConversations = [
  {
    id: "1",
    name: "Alice",
    lastMessage: "Hey, how are you?",
    timestamp: "10:30 AM",
  },
  { id: "2", name: "Bob", lastMessage: "Sounds good!", timestamp: "Yesterday" },
  {
    id: "3",
    name: "Charlie",
    lastMessage: "See you there.",
    timestamp: "Tuesday",
  },
];

export default function TabTwoScreen() {
  const router = useRouter();
  const [showQRModal, setShowQRModal] = useState(false);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [viewMode, setViewMode] = useState<"show" | "scan">("show");
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedData, setScannedData] = useState<string | null>(null);

  useEffect(() => {
    const loadCredentials = async () => {
      try {
        const storedCreds = await secureFetch(CREDENTIALS_KEY);
        const serialized: SerializedCredentials = JSON.parse(storedCreds);

        const creds: Credentials = {
          verificationKey: Buffer.from(serialized.verificationKey, "base64"),
          pseudonym: serialized.pseudonym,
          signature: Buffer.from(serialized.signature, "base64"),
          rsaPublicKey: serialized.rsaPublicKey,
        };

        setCredentials(creds);
      } catch (error) {
        console.error("Failed to load credentials:", error);
      }
    };

    loadCredentials();
  }, []);

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    setScannedData(data);
    console.log("Scanned QR code");
    // TODO: Parse and handle scanned credentials
    const scannedCredentials = deserializeCredentialsFromQR(data);
    console.log(scannedCredentials);
  };

  const handleOpenModal = () => {
    setShowQRModal(true);
    setViewMode("show");
    setScannedData(null);
  };

  const renderItem = ({ item }: { item: Conversation }) => (
    <ConversationItem
      conversation={item}
      onPress={() =>
        router.navigate({
          pathname: "/chats/[chatId]",
          params: { chatId: item.id },
        })
      }
    />
  );

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.mainContainer}>
        <View style={styles.chatHeader}>
          <Pressable onPress={handleOpenModal}>
            <IconSymbol size={28} name="qrcode" color={"white"}></IconSymbol>
          </Pressable>
          <Text style={styles.headerText}>Chats</Text>
          <IconSymbol
            size={28}
            name="square.and.pencil"
            color={"white"}
          ></IconSymbol>
        </View>
        <FlatList
          data={mockConversations}
          showsVerticalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
        />

        <Modal
          visible={showQRModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowQRModal(false)}
          style={styles.modalOverlay}
        >
          <SafeAreaProvider>
            <SafeAreaView style={styles.modalContent}>
              {/* Mode Switch */}
              <View style={{ alignItems: "center", marginBottom: 15 }}>
                <View style={styles.switchContainer}>
                  <Pressable
                    style={[
                      styles.switchButton,
                      viewMode === "show" && styles.switchButtonActive,
                    ]}
                    onPress={() => setViewMode("show")}
                  >
                    <Text
                      style={[
                        styles.switchText,
                        viewMode === "show" && styles.switchTextActive,
                      ]}
                    >
                      Code
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.switchButton,
                      viewMode === "scan" && styles.switchButtonActive,
                    ]}
                    onPress={() => {
                      setViewMode("scan");
                      if (!permission?.granted) {
                        requestPermission();
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.switchText,
                        viewMode === "scan" && styles.switchTextActive,
                      ]}
                    >
                      Scan
                    </Text>
                  </Pressable>
                </View>
                <Pressable
                  onPress={() => setShowQRModal(false)}
                  style={({ pressed }) => [
                    styles.closeIconButton,
                    pressed && styles.closeIconButtonPressed,
                  ]}
                >
                  <IconSymbol size={42} name="x.circle" color={"white"} />
                </Pressable>
              </View>

              {/* Show QR Code View */}
              {viewMode === "show" && credentials && (
                <>
                  <CredentialsQR
                    credentials={credentials}
                    title="Scan to Add Me"
                    size={300}
                  />
                  <View style={styles.shareButtonContainer}>
                    <Pressable style={styles.shareButton}>
                      <IconSymbol
                        size={28}
                        name="square.and.arrow.up"
                        color={"white"}
                      />
                    </Pressable>
                    <Text style={{ color: "white", marginTop: 5 }}>Share</Text>
                  </View>
                </>
              )}

              {/* Scan QR Code View */}
              {viewMode === "scan" && (
                <View style={styles.scanContainer}>
                  {!permission?.granted ? (
                    <View style={styles.permissionContainer}>
                      <Text style={styles.permissionText}>
                        Camera permission required
                      </Text>
                      <Pressable
                        style={styles.permissionButton}
                        onPress={requestPermission}
                      >
                        <Text style={styles.permissionButtonText}>
                          Grant Permission
                        </Text>
                      </Pressable>
                    </View>
                  ) : (
                    <>
                      <CameraView
                        style={styles.camera}
                        facing="back"
                        onBarcodeScanned={
                          scannedData ? undefined : handleBarCodeScanned
                        }
                        barcodeScannerSettings={{
                          barcodeTypes: ["qr"],
                        }}
                      />
                      {scannedData && (
                        <View style={styles.scannedDataContainer}>
                          <Text style={styles.scannedDataText}>
                            QR Code Scanned!
                          </Text>
                          <Pressable
                            style={styles.scanAgainButton}
                            onPress={() => setScannedData(null)}
                          >
                            <Text style={styles.scanAgainButtonText}>
                              Scan Again
                            </Text>
                          </Pressable>
                        </View>
                      )}
                    </>
                  )}
                </View>
              )}

              <Text style={styles.qrText}>
                Only share the QR code and link with people you trust. When
                shared, others will be able to see your username and start a
                chat with you.
              </Text>
            </SafeAreaView>
          </SafeAreaProvider>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: "#090909ff",
  },
  chatHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    padding: 15,
    backgroundColor: "rgba(38, 35, 35, 0.2)",
  },
  headerText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    // justifyContent: "center",
    // alignItems: "center",
  },
  modalContent: {
    flex: 1,
    width: "100%",
    backgroundColor: "#090909ff",
    // justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  shareButtonContainer: {
    alignItems: "center",
  },
  shareButton: {
    marginTop: 20,
    backgroundColor: "#1a1a1aff",
    paddingTop: 8,
    paddingBottom: 10,
    paddingLeft: 20,
    paddingRight: 20,
    borderRadius: 25,
  },
  qrText: {
    color: "white",
    textAlign: "center",
    marginTop: 20,
  },
  closeIconButton: {
    position: "absolute",
    right: -100,
  },
  closeIconButtonPressed: {
    transform: [{ scale: 1.2 }],
  },
  switchContainer: {
    flexDirection: "row",
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 4,
  },
  switchButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 6,
  },
  switchButtonActive: {
    backgroundColor: "#333",
  },
  switchText: {
    color: "#666",
    fontSize: 14,
    fontWeight: "600",
  },
  switchTextActive: {
    color: "white",
  },
  scanContainer: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  camera: {
    width: "100%",
    flex: 1,
    maxHeight: 500,
  },
  permissionContainer: {
    padding: 20,
    alignItems: "center",
  },
  permissionText: {
    color: "white",
    fontSize: 16,
    marginBottom: 20,
    textAlign: "center",
  },
  permissionButton: {
    backgroundColor: "#333",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  scannedDataContainer: {
    position: "absolute",
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    padding: 20,
    borderRadius: 12,
    alignItems: "center",
  },
  scannedDataText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  scanAgainButton: {
    backgroundColor: "#333",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  scanAgainButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
});
