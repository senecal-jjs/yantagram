import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { CredentialProvider } from "@/contexts/credential-context";
import { GroupCreationProvider } from "@/contexts/group-creation-context";
import { RepositoryProvider } from "@/contexts/repository-context";
import { SettingsProvider } from "@/contexts/settings-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { migrateDb } from "@/repos/db";
import { Buffer } from "buffer";
import * as SQLite from "expo-sqlite";
import { SQLiteProvider } from "expo-sqlite";
import "react-native-get-random-values";

global.Buffer = Buffer;

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  SQLite.deleteDatabaseAsync("bitchat.db");
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <SettingsProvider>
        <SQLiteProvider databaseName="bitchat.db" onInit={migrateDb}>
          <RepositoryProvider>
            <CredentialProvider>
              <GroupCreationProvider>
                <Stack>
                  <Stack.Screen
                    name="(tabs)"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    name="(group-modal)"
                    options={{ presentation: "modal", headerShown: false }}
                  />
                  <Stack.Screen
                    name="(group-manager-modal)"
                    options={{ presentation: "modal", headerShown: false }}
                  ></Stack.Screen>
                  <Stack.Screen
                    name="(settings-modal)"
                    options={{ presentation: "modal", headerShown: false }}
                  ></Stack.Screen>
                </Stack>
                <StatusBar style="auto" />
              </GroupCreationProvider>
            </CredentialProvider>
          </RepositoryProvider>
        </SQLiteProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}
