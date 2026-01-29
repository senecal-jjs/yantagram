import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { ActiveChatProvider } from "@/contexts/active-chat-context";
import { CredentialProvider } from "@/contexts/credential-context";
import { GroupCreationProvider } from "@/contexts/group-creation-context";
import { RepositoryProvider } from "@/contexts/repository-context";
import { SettingsProvider, useSettings } from "@/contexts/settings-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useMessageRetention } from "@/hooks/use-message-retention";
import { useMessageRetry } from "@/hooks/use-message-retry";
import { useNotifications } from "@/hooks/use-notifications";
import { useRelayWorker } from "@/hooks/use-relay-worker";
import { migrateDb } from "@/repos/db";
import { setNotificationsEnabled } from "@/services/notification-service";
import { Buffer } from "buffer";
import * as SQLite from "expo-sqlite";
import { SQLiteProvider } from "expo-sqlite";
import { useEffect } from "react";
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
  useRelayWorker();
  useNotifications();

  // Sync notification setting to the notification service
  const { settings } = useSettings();
  useEffect(() => {
    setNotificationsEnabled(settings.notificationsEnabled);
  }, [settings.notificationsEnabled]);

  return <>{children}</>;
}

/**
 * Component that runs background tasks requiring credential context access
 */
function CredentialBackgroundTasks({
  children,
}: {
  children: React.ReactNode;
}) {
  useMessageRetry();
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
                  <CredentialBackgroundTasks>
                    <ActiveChatProvider>
                      <GroupCreationProvider>
                        <Stack>
                          <Stack.Screen
                            name="(tabs)"
                            options={{ headerShown: false }}
                          />
                          <Stack.Screen
                            name="(group-modal)"
                            options={{
                              presentation: "modal",
                              headerShown: false,
                            }}
                          />
                          <Stack.Screen
                            name="(group-manager-modal)"
                            options={{
                              presentation: "modal",
                              headerShown: false,
                            }}
                          ></Stack.Screen>
                          <Stack.Screen
                            name="(settings-modal)"
                            options={{
                              presentation: "modal",
                              headerShown: false,
                            }}
                          ></Stack.Screen>
                        </Stack>
                        <StatusBar style="auto" />
                      </GroupCreationProvider>
                    </ActiveChatProvider>
                  </CredentialBackgroundTasks>
                </CredentialProvider>
              </BackgroundTasks>
            </RepositoryProvider>
          </SQLiteProvider>
        </SettingsProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
