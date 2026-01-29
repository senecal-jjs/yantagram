import {
    requestNotificationPermissions,
    setupNotificationResponseHandler,
} from "@/services/notification-service";
import { useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";

/**
 * Hook that initializes and manages notifications for the app.
 * - Requests permissions on mount
 * - Tracks app foreground/background state
 * - Sets up notification tap handlers
 */
export function useNotifications() {
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [appState, setAppState] = useState<AppStateStatus>(
    AppState.currentState,
  );
  const appStateRef = useRef(AppState.currentState);

  // Request notification permissions on mount
  useEffect(() => {
    const initializeNotifications = async () => {
      const granted = await requestNotificationPermissions();
      setPermissionGranted(granted);
    };

    initializeNotifications();
  }, []);

  // Set up notification response handler (for taps)
  useEffect(() => {
    const cleanup = setupNotificationResponseHandler();
    return cleanup;
  }, []);

  // Track app state (foreground/background)
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      appStateRef.current = nextAppState;
      setAppState(nextAppState);

      if (nextAppState === "active") {
        console.log("[Notifications] App came to foreground");
      } else if (nextAppState === "background") {
        console.log("[Notifications] App went to background");
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return {
    /**
     * Whether notification permissions are granted.
     */
    permissionGranted,

    /**
     * Current app state: 'active', 'background', or 'inactive'.
     */
    appState,

    /**
     * Whether the app is currently in the background.
     */
    isBackground: appState !== "active",

    /**
     * Get the current app state synchronously (useful in callbacks).
     */
    getAppState: () => appStateRef.current,
  };
}
