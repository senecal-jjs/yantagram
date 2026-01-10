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
import { useMessageRetention } from "@/hooks/use-message-retention";
import { migrateDb } from "@/repos/db";
import { Buffer } from "buffer";
import * as SQLite from "expo-sqlite";
import { SQLiteProvider } from "expo-sqlite";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-get-random-values";

global.Buffer = Buffer;

export const unstable_settings = {
  anchor: "(tabs)",
};

/**
 * Component that runs background tasks requiring context access
 */
function BackgroundTasks({ children }: { children: React.ReactNode }) {
  useMessageRetention();
  return <>{children}</>;
}

export default function RootLayout() {
  SQLite.deleteDatabaseAsync("bitchat.db");
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <SettingsProvider>
          <SQLiteProvider databaseName="bitchat.db" onInit={migrateDb}>
            <RepositoryProvider>
              <BackgroundTasks>
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
              </BackgroundTasks>
            </RepositoryProvider>
          </SQLiteProvider>
        </SettingsProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
