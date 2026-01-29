import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { Platform } from "react-native";

/**
 * Notification service for handling local push notifications
 * when messages arrive in Yantagram.
 */

// Configure how notifications are displayed when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: false,
    shouldShowList: true,
  }),
});

export interface MessageNotificationData {
  messageId: string;
  groupId: string;
  senderPseudonym: string;
  groupName: string;
  messagePreview: string;
}

// Track currently active chat (set from ActiveChatContext)
let activeChatId: string | null = null;

// Track if notifications are enabled (set from settings)
let notificationsEnabled = true;

// Callback to get unread message count from repository
let getUnreadCountCallback: (() => Promise<number>) | null = null;

/**
 * Register a callback to get the unread message count.
 * This is called from the app to inject the repository dependency.
 */
export function registerUnreadCountCallback(
  callback: () => Promise<number>,
): void {
  getUnreadCountCallback = callback;
}

/**
 * Sync the app badge with the unread message count.
 */
export async function syncBadgeWithUnreadCount(): Promise<void> {
  if (!getUnreadCountCallback) {
    console.warn("[Notifications] No unread count callback registered");
    return;
  }

  try {
    const count = await getUnreadCountCallback();
    await Notifications.setBadgeCountAsync(count);
    console.log(`[Notifications] Badge synced to ${count} unread messages`);
  } catch (error) {
    console.error("[Notifications] Failed to sync badge:", error);
  }
}

/**
 * Update the active chat ID from the context.
 */
export function setActiveChatId(chatId: string | null): void {
  activeChatId = chatId;
}

/**
 * Update the notifications enabled setting.
 */
export function setNotificationsEnabled(enabled: boolean): void {
  notificationsEnabled = enabled;
}

/**
 * Check if a notification should be shown for a given chat.
 */
export function shouldShowNotification(groupId: string): boolean {
  // Don't show if notifications are disabled
  if (!notificationsEnabled) {
    return false;
  }

  // Don't show if user is currently viewing this chat
  if (activeChatId === groupId) {
    return false;
  }

  // Only show when app is in background or inactive
  // (We show in foreground too but only for other chats)
  return true;
}

/**
 * Request notification permissions from the user.
 * Returns true if permissions were granted.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();

  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("[Notifications] Permission not granted");
    return false;
  }

  // Set up Android notification channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("messages", {
      name: "Messages",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
      sound: "default",
    });
  }

  console.log("[Notifications] Permission granted");
  return true;
}

/**
 * Show a local notification for an incoming message.
 */
export async function showMessageNotification(
  data: MessageNotificationData,
): Promise<void> {
  const { messageId, groupId, senderPseudonym, groupName, messagePreview } =
    data;

  // Determine title based on whether it's a group or 1:1 chat
  const isGroupChat = groupName !== senderPseudonym;
  const title = isGroupChat ? groupName : senderPseudonym;
  const body = isGroupChat
    ? `${senderPseudonym}: ${messagePreview}`
    : messagePreview;

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: {
        messageId,
        groupId,
        type: "message",
      },
      sound: "default",
      ...(Platform.OS === "android" && { channelId: "messages" }),
    },
    trigger: null, // Show immediately
  });

  console.log(`[Notifications] Showed notification for message ${messageId}`);
}

/**
 * Clear all notifications for a specific group.
 * Called when user opens that chat.
 */
export async function clearNotificationsForGroup(
  groupId: string,
): Promise<void> {
  const notifications = await Notifications.getPresentedNotificationsAsync();

  for (const notification of notifications) {
    const data = notification.request.content.data;
    if (data?.groupId === groupId) {
      await Notifications.dismissNotificationAsync(
        notification.request.identifier,
      );
    }
  }

  console.log(`[Notifications] Cleared notifications for group ${groupId}`);
}

/**
 * Clear all notifications.
 */
export async function clearAllNotifications(): Promise<void> {
  await Notifications.dismissAllNotificationsAsync();
}

/**
 * Update the app badge count.
 */
export async function updateBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count);
}

/**
 * Set up notification response handler for when user taps a notification.
 * Returns a function to remove the listener.
 */
export function setupNotificationResponseHandler(): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data;

      if (data?.type === "message" && data?.groupId) {
        // Navigate to the chat
        router.push(`/(tabs)/chats/${data.groupId}`);
      }
    },
  );

  return () => subscription.remove();
}

/**
 * Get the count of currently displayed notifications.
 */
export async function getNotificationCount(): Promise<number> {
  const notifications = await Notifications.getPresentedNotificationsAsync();
  return notifications.length;
}
