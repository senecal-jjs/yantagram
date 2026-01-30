import {
  clearNotificationsForGroup,
  setActiveChatId as setActiveChatIdInService,
} from "@/services/notification-service";
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";

interface ActiveChatContextType {
  /**
   * The ID of the currently active/viewed chat, or null if no chat is open.
   */
  activeChatId: string | null;

  /**
   * Set the active chat ID when a chat screen is focused.
   * Also clears any pending notifications for that chat.
   */
  setActiveChat: (chatId: string | null) => void;

  /**
   * Check if a given chat ID is currently active.
   */
  isChatActive: (chatId: string) => boolean;
}

const ActiveChatContext = createContext<ActiveChatContextType | undefined>(
  undefined,
);

export const ActiveChatProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const setActiveChat = useCallback((chatId: string | null) => {
    setActiveChatId(chatId);

    // Sync with notification service for shouldShowNotification check
    setActiveChatIdInService(chatId);

    // Clear notifications for this chat when it becomes active
    if (chatId) {
      clearNotificationsForGroup(chatId).catch((error) => {
        console.error(
          "[ActiveChatContext] Failed to clear notifications:",
          error,
        );
      });
    }
  }, []);

  const isChatActive = useCallback(
    (chatId: string) => {
      return activeChatId === chatId;
    },
    [activeChatId],
  );

  const value: ActiveChatContextType = {
    activeChatId,
    setActiveChat,
    isChatActive,
  };

  return (
    <ActiveChatContext.Provider value={value}>
      {children}
    </ActiveChatContext.Provider>
  );
};

export const useActiveChat = (): ActiveChatContextType => {
  const context = useContext(ActiveChatContext);
  if (!context) {
    throw new Error("useActiveChat must be used within an ActiveChatProvider");
  }
  return context;
};
