import { CredentialsQR } from "@/components/credentials-qr";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  ContactsRepositoryToken,
  useRepos,
} from "@/contexts/repository-context";
import ContactsRepository from "@/repos/specs/contacts-repository";
import { deserializeCredentialsFromQR } from "@/treekem/protocol";
import { Credentials, SerializedCredentials } from "@/treekem/types";
import { Mutex } from "@/utils/mutex";
import { secureFetch } from "@/utils/secure-store";
import { CameraView, useCameraPermissions } from "expo-camera";
import React, { PropsWithChildren, useEffect, useRef, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

const CREDENTIALS_KEY = "treekem_credentials";

type Props = PropsWithChildren<{
  showQRModal: boolean;
  handleClose: () => void;
}>;

export default function QRModal({ showQRModal, handleClose }: Props) {
  const mutex = new Mutex();
  const [viewMode, setViewMode] = useState<"show" | "scan">("show");
  const [scannedData, setScannedData] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const { getRepo } = useRepos();
  const contactsRepo = getRepo<ContactsRepository>(ContactsRepositoryToken);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    const loadCredentials = async () => {
      try {
        const storedCreds = await secureFetch(CREDENTIALS_KEY);
        const serialized: SerializedCredentials = JSON.parse(storedCreds);

        const creds: Credentials = {
          verificationKey: Buffer.from(serialized.verificationKey, "base64"),
          pseudonym: serialized.pseudonym,
          signature: Buffer.from(serialized.signature, "base64"),
          ecdhPublicKey: Buffer.from(serialized.ecdhPublicKey, "base64"),
        };

        setCredentials(creds);
      } catch (error) {
        console.error("Failed to load credentials:", error);
      }
    };

    loadCredentials();
  }, []);

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    // Prevent multiple scans
    if (isProcessingRef.current) {
      return;
    }

    isProcessingRef.current = true;
    setScannedData(data);

    try {
      const scannedCredentials = deserializeCredentialsFromQR(data);

      console.log(scannedCredentials);

      // Check if contact already exists
      const exists = await contactsRepo.exists(
        scannedCredentials.verificationKey,
      );

      if (exists) {
        Alert.alert(
          "Contact Exists",
          `${scannedCredentials.pseudonym} is already in your contacts.`,
          [{ text: "OK", onPress: () => setScannedData(null) }],
        );
        return;
      }

      // Save new contact
      const contact = await contactsRepo.create(scannedCredentials);

      Alert.alert(
        "Contact Added",
        `${contact.pseudonym} has been added to your contacts.`,
        [{ text: "OK", onPress: () => setScannedData(null) }],
      );

      console.log("Contact saved:", contact);
    } catch (error) {
      console.error("Failed to save contact:", error);
      Alert.alert("Error", "Failed to add contact. Please try again.", [
        { text: "OK" },
      ]);
    } finally {
      isProcessingRef.current = false;
    }
  };

  const close = () => {
    setViewMode("show");
    setScannedData(null);
    isProcessingRef.current = false;
    handleClose();
  };

  return (
    <Modal
      visible={showQRModal}
      transparent
      animationType="fade"
      onRequestClose={() => close()}
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
              onPress={() => close()}
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
                size={250}
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
                  <View style={styles.cameraOverlay}>
                    <Text
                      style={{
                        color: "white",
                        marginTop: 5,
                        fontWeight: "500",
                      }}
                    >
                      Scan the QR code on your contact&apos;s device
                    </Text>
                  </View>
                </>
              )}
            </View>
          )}

          {viewMode === "show" && (
            <Text style={styles.qrText}>
              Only share the QR code and link with people you trust. When
              shared, others will be able to see your username and start a chat
              with you.
            </Text>
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    // justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
  },
  modalContent: {
    flex: 1,
    width: "100%",
    backgroundColor: "#090909ff",
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
    maxHeight: "100%",
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
