import { useThemeColor } from "@/hooks/use-theme-color";
import { serializeCredentialsForQR } from "@/treekem/protocol";
import { Credentials } from "@/treekem/types";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

export type CredentialsQRProps = {
  credentials: Credentials;
  size?: number;
  title?: string;
  lightColor?: string;
  darkColor?: string;
};

/**
 * Component that displays a QR code containing serialized TreeKEM credentials
 * for secure out-of-band credential exchange
 */
export function CredentialsQR({
  credentials,
  size = 250,
  title,
  lightColor,
  darkColor,
}: CredentialsQRProps) {
  const backgroundColor = useThemeColor(
    { light: lightColor, dark: darkColor },
    "background",
  );
  const textColor = useThemeColor(
    { light: lightColor, dark: darkColor },
    "text",
  );

  const qrData = serializeCredentialsForQR(credentials);

  return (
    <View style={[styles.container, { backgroundColor }]}>
      {title && (
        <Text style={[styles.title, { color: textColor }]}>{title}</Text>
      )}
      <View style={styles.qrContainer}>
        <QRCode
          value={qrData}
          size={size}
          backgroundColor="white"
          color="black"
          ecl="H" // High error correction for credential security
        />
      </View>
      <Text style={[styles.pseudonym, { color: textColor }]}>
        @{credentials.pseudonym}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    padding: 20,
    borderRadius: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
  },
  qrContainer: {
    padding: 16,
    backgroundColor: "white",
    borderRadius: 16,
  },
  pseudonym: {
    fontSize: 14,
    marginTop: 12,
    opacity: 0.7,
  },
});
