import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { MessageProvider } from "@/contexts/message-context";
import { RepositoryProvider } from "@/contexts/repository-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { migrateDb } from "@/repos/db";
import { Credentials, SerializedCredentials } from "@/treekem/types";
import { ECDHKeyPair, SignatureMaterial } from "@/treekem/upke";
import {
  generateRandomName
} from "@/utils/names";
import { secureFetch, secureStore } from "@/utils/secure-store";
import { Buffer } from "buffer";
import * as SQLite from "expo-sqlite";
import { SQLiteProvider } from "expo-sqlite";
import { useEffect } from "react";
import "react-native-get-random-values";

global.Buffer = Buffer;

const CREDENTIALS_KEY = "treekem_credentials";
const SIGNING_MATERIAL_KEY = "treekem_signing_material";
const ECDH_KEYPAIR_KEY = "treekem_ecdh_keypair";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  SQLite.deleteDatabaseAsync("bitchat.db");
  const colorScheme = useColorScheme();

  useEffect(() => {
    const initializeCredentials = async () => {
      try {
        // Try to load existing credentials
        const storedCreds = await secureFetch(CREDENTIALS_KEY);
        const serialized: SerializedCredentials = JSON.parse(storedCreds);

        const creds: Credentials = {
          verificationKey: Buffer.from(serialized.verificationKey, "base64"),
          pseudonym: serialized.pseudonym,
          signature: Buffer.from(serialized.signature, "base64"),
          ecdhPublicKey: Buffer.from(serialized.ecdhPublicKey, "base64"),
        };

        console.log("Loaded existing credentials for:", creds.pseudonym);
      } catch {
        // No credentials exist, generate new ones with random pseudonym
        console.log("No credentials found, generating new ones");

        // Generate signing material (Ed25519)
        const signingMaterial = SignatureMaterial.generate();

        console.log("generated signing material");

        // Generate ECDH keypair (X25519)
        const ecdhKeyPair = ECDHKeyPair.generate();

        console.log("generated ECDH keypair");

        // Create signature
        const signature = signingMaterial.sign(signingMaterial.publicKey);

        console.log("created signature");

        const newPseudonym = generateRandomName();

        // Create credentials
        const creds: Credentials = {
          verificationKey: signingMaterial.publicKey,
          pseudonym: newPseudonym,
          signature,
          ecdhPublicKey: ecdhKeyPair.publicKey,
        };

        // Serialize for storage
        const serialized: SerializedCredentials = {
          verificationKey: Buffer.from(creds.verificationKey).toString(
            "base64",
          ),
          pseudonym: creds.pseudonym,
          signature: Buffer.from(creds.signature).toString("base64"),
          ecdhPublicKey: Buffer.from(creds.ecdhPublicKey).toString("base64"),
        };

        // Store credentials
        await secureStore(CREDENTIALS_KEY, JSON.stringify(serialized));

        // Store signing material (private key)
        await secureStore(
          SIGNING_MATERIAL_KEY,
          JSON.stringify({
            publicKey: Buffer.from(signingMaterial.publicKey).toString(
              "base64",
            ),
            privateKey: Buffer.from(signingMaterial.privateKey).toString(
              "base64",
            ),
          }),
        );

        // Store ECDH keypair (private key)
        await secureStore(
          ECDH_KEYPAIR_KEY,
          JSON.stringify({
            publicKey: Buffer.from(ecdhKeyPair.publicKey).toString("base64"),
            privateKey: Buffer.from(ecdhKeyPair.privateKey).toString("base64"),
          }),
        );

        console.log("Generated new credentials for:", newPseudonym);
      }
    };

    initializeCredentials();
  }, []);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <SQLiteProvider databaseName="bitchat.db" onInit={migrateDb}>
        <RepositoryProvider>
          <MessageProvider>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="modal"
                options={{ presentation: "modal", title: "Modal" }}
              />
            </Stack>
            <StatusBar style="auto" />
          </MessageProvider>
        </RepositoryProvider>
      </SQLiteProvider>
    </ThemeProvider>
  );
}
