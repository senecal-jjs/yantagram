import { CredentialsQR, QRCodeRef } from "@/components/credentials-qr";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useCredential } from "@/contexts/credential-context";
import {
  ContactsRepositoryToken,
  useRepos,
} from "@/contexts/repository-context";
import ContactsRepository from "@/repos/specs/contacts-repository";
import { deserializeCredentialsFromQR } from "@/treekem/protocol";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Sharing from "expo-sharing";
import React, { PropsWithChildren, useRef, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import Svg, {
  Rect,
  Image as SvgImage,
  Text as SvgText,
  TSpan,
} from "react-native-svg";
import ViewShot from "react-native-view-shot";
import { BounceButton } from "./ui/bounce-button";

type Props = PropsWithChildren<{
  showQRModal: boolean;
  handleClose: () => void;
}>;

export default function QRModal({ showQRModal, handleClose }: Props) {
  const [viewMode, setViewMode] = useState<"show" | "scan">("show");
  const [scannedData, setScannedData] = useState<string | null>(null);
  const [qrImageData, setQrImageData] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const { member } = useCredential();
  const { getRepo } = useRepos();
  const contactsRepo = getRepo<ContactsRepository>(ContactsRepositoryToken);
  const isProcessingRef = useRef(false);
  const qrCodeRef = useRef<QRCodeRef | null>(null);
  const viewShotRef = useRef<ViewShot | null>(null);

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

      // Save new contact (verifiedOob == true)
      const contact = await contactsRepo.create(scannedCredentials, true);

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

  const handleShare = async () => {
    if (!member || !qrCodeRef.current) return;

    try {
      // Get base64 data from QR code
      qrCodeRef.current.toDataURL(async (qrData: string) => {
        try {
          // Set the QR image data to trigger render of the hidden SVG
          setQrImageData(qrData);

          // Wait a bit for the view to render
          await new Promise((resolve) => setTimeout(resolve, 100));

          // Capture the combined SVG as a PNG using ViewShot
          if (viewShotRef.current?.capture) {
            const uri = await viewShotRef.current.capture();

            // Share the captured image
            if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(uri, {
                mimeType: "image/png",
                dialogTitle: "Share QR Code",
              });
            } else {
              Alert.alert(
                "Sharing not available",
                "Unable to share on this device.",
              );
            }
          }

          // Clear the QR image data
          setQrImageData(null);
        } catch (error) {
          console.error("Failed to share image:", error);
          setQrImageData(null);
          Alert.alert("Error", "Failed to share QR code image.");
        }
      });
    } catch (error) {
      console.error("Failed to share:", error);
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
            <BounceButton
              onPress={() => close()}
              style={styles.closeIconButton}
            >
              <IconSymbol size={42} name="x.circle" color={"white"} />
            </BounceButton>
          </View>

          {/* Show QR Code View */}
          {viewMode === "show" && member && (
            <>
              <CredentialsQR
                credentials={member.credential}
                title="Scan to Add Me"
                size={250}
                getRef={(ref) => (qrCodeRef.current = ref)}
              />
              <View style={styles.shareButtonContainer}>
                <Pressable
                  style={styles.shareButton}
                  onPress={() => handleShare()}
                >
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

      {/* Hidden ViewShot for capturing combined QR code with text */}
      {qrImageData && (
        <View style={styles.hiddenContainer}>
          <ViewShot ref={viewShotRef} options={{ format: "png", quality: 1.0 }}>
            <Svg width={330} height={410}>
              <Rect x="0" y="0" width="330" height="410" fill="white" />
              <SvgImage
                href={`data:image/png;base64,${qrImageData}`}
                x="40"
                y="40"
                width="250"
                height="250"
              />
              <SvgText
                x="165"
                y="325"
                textAnchor="middle"
                fontFamily="Arial"
                fontSize="14"
                fill="black"
              >
                <TSpan x="165" dy="0">
                  Scan this QR code with your phone
                </TSpan>
                <TSpan x="165" dy="22">
                  to chat with me on Yantagram
                </TSpan>
              </SvgText>
            </Svg>
          </ViewShot>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  hiddenContainer: {
    position: "absolute",
    left: -9999,
    top: -9999,
  },
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
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.15)",
    borderLeftColor: "rgba(255, 255, 255, 0.15)",
    shadowColor: "rgba(255, 255, 255, 0.1)",
    shadowOffset: {
      width: -1,
      height: -1,
    },
    shadowOpacity: 1,
    shadowRadius: 2,
  },
  qrText: {
    color: "white",
    textAlign: "center",
    marginTop: 20,
  },
  closeIconButton: {
    position: "absolute",
    right: -180,
    top: -42,
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
