import ConversationItem from "@/components/conversation";
import QRModal from "@/components/qr-modal";
import { BounceButton } from "@/components/ui/bounce-button";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useCredentials } from "@/contexts/credential-context";
import {
  GroupsRepositoryToken,
  MessagesRepositoryToken,
  useRepos,
} from "@/contexts/repository-context";
import { useSettings } from "@/contexts/settings-context";
import { dbListener } from "@/repos/db-listener";
import GroupsRepository from "@/repos/specs/groups-repository";
import MessagesRepository from "@/repos/specs/messages-repository";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

export type Conversation = {
  id: string;
  name: string;
  lastMessage: string;
  hasUnread: boolean;
  timestamp: string;
  rawTimestamp: number;
};

export default function TabTwoScreen() {
  const router = useRouter();
  const { deleteMember } = useCredentials();
  const { resetSettings } = useSettings();
  const [showQRModal, setShowQRModal] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const { getRepo } = useRepos();
  const groupsRepo = getRepo<GroupsRepository>(GroupsRepositoryToken);
  const messagesRepo = getRepo<MessagesRepository>(MessagesRepositoryToken);
  const tapCount = useRef(0);
  const tapTimer = useRef<NodeJS.Timeout | null>(null);

  const handlePanicButton = async () => {
    tapCount.current += 1;

    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
    }

    if (tapCount.current === 3) {
      tapCount.current = 0;
      try {
        await messagesRepo.deleteAll();
        await deleteMember();
        await resetSettings();
        Alert.alert(
          "Data Deleted",
          "All app data has been deleted. The app will restart.",
          [
            {
              text: "OK",
              onPress: () => router.replace("/"),
            },
          ],
        );
      } catch (error) {
        Alert.alert("Error", "Failed to delete messages.");
      }
    } else {
      tapTimer.current = setTimeout(() => {
        tapCount.current = 0;
      }, 1000); // Reset after 1 second
    }
  };

  const formatTimestamp = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const millisDay = 86_400_000;

    if (diff < millisDay) {
      // Less than a day
      const date = new Date(timestamp);
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } else if (diff < millisDay * 7) {
      // Less than a week
      const date = new Date(timestamp);
      return date.toLocaleDateString("en-US", { weekday: "long" });
    } else {
      const date = new Date(timestamp);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    }
  };

  const fetchConversations = useCallback(async () => {
    const groups = await groupsRepo.list();
    console.log("building conversations: ", Date.now());

    const conversationPromises = groups.map(async (group) => {
      // Get last message for this group
      const lastMessageData = await messagesRepo.getByGroupId(group.id, 1, 0);
      const hasUnread = await messagesRepo.hasUnreadInGroup(group.id);

      let lastMessage = "";
      let timestamp = "";
      let rawTimestamp = 0;

      if (lastMessageData.length > 0) {
        lastMessage = lastMessageData[0].message.contents;
        rawTimestamp = lastMessageData[0].message.timestamp;
        timestamp = formatTimestamp(rawTimestamp);
      } else {
        lastMessage = "You've been added to a group";
        rawTimestamp = group.createdAt;
        timestamp = formatTimestamp(rawTimestamp);
      }

      return {
        id: group.id,
        name: group.name,
        lastMessage,
        hasUnread,
        timestamp,
        rawTimestamp,
      };
    });

    const fetchedConversations = (await Promise.all(conversationPromises)).sort(
      (a, b) => b.rawTimestamp - a.rawTimestamp,
    );
    setConversations(fetchedConversations);
  }, [groupsRepo, messagesRepo]);

  // force refresh on focus, to make sure unread/read dot is shown appropriately
  useFocusEffect(() => {
    fetchConversations();
  });

  useEffect(() => {
    fetchConversations();

    // Listen for group creation events
    dbListener.onGroupCreation(fetchConversations);
    dbListener.onGroupUpdate(fetchConversations);
    dbListener.onMessageChange(fetchConversations);

    // Cleanup listener on unmount
    return () => {
      dbListener.removeGroupCreationListener(fetchConversations);
      dbListener.removeGroupUpdateListener(fetchConversations);
      dbListener.removeMessageChangeListener(fetchConversations);
    };
  }, [fetchConversations]);

  const handleOpenModal = () => {
    setShowQRModal(true);
  };

  const onSettingsPress = () => {
    router.navigate({
      pathname: "/(settings-modal)/start-settings",
    });
  };

  const startNewMessage = () => {
    router.navigate({
      pathname: "/(group-modal)/start-group",
    });
  };

  const renderItem = ({ item }: { item: Conversation }) => (
    <ConversationItem
      conversation={item}
      onPress={() =>
        router.navigate({
          pathname: "/chats/[chatId]",
          params: { chatId: item.id },
        })
      }
    />
  );

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.mainContainer}>
        {conversations.length > 0 && (
          <FlatList
            data={conversations}
            showsVerticalScrollIndicator={false}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
          />
        )}
        {conversations.length <= 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No chats yet</Text>
            <Text style={styles.emptySubtext}>
              Tap the new message icon to start a chat
            </Text>
          </View>
        )}

        <BounceButton style={styles.logoContainer} onPress={onSettingsPress}>
          <View style={styles.logoButton}>
            <View style={styles.logoAvatar}></View>
            <Text style={styles.logoText}>Yantagram</Text>
          </View>
        </BounceButton>

        <View
          style={[
            styles.floatingButtonContainer,
            styles.floatingButtonBottomRight,
          ]}
        >
          <BounceButton onPress={handleOpenModal}>
            <IconSymbol size={28} name="qrcode" color={"white"}></IconSymbol>
          </BounceButton>

          <BounceButton onPress={() => startNewMessage()}>
            <IconSymbol
              size={28}
              name="square.and.pencil"
              color={"white"}
            ></IconSymbol>
          </BounceButton>
        </View>

        <View style={styles.panicButtonContainer}>
          <BounceButton style={styles.panicButton} onPress={handlePanicButton}>
            <IconSymbol
              size={24}
              name="exclamationmark.triangle.fill"
              color={"#ff4444"}
            ></IconSymbol>
          </BounceButton>
        </View>

        <QRModal
          showQRModal={showQRModal}
          handleClose={() => setShowQRModal(false)}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: "#090909ff",
  },
  logoButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoContainer: {
    position: "absolute",
    top: -180,
    left: 20,
    backgroundColor: "#272727ff",
    padding: 10,
    borderRadius: 20,
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
  logoAvatar: {
    width: 25,
    height: 25,
    borderRadius: 20,
    backgroundColor: "#5766b1ff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 13,
  },
  logoText: {
    color: "white",
    fontWeight: 600,
    fontSize: 14,
  },
  floatingButtonBottomRight: {
    position: "absolute",
    bottom: 20,
    right: 20,
  },
  floatingButtonBottomLeft: {
    position: "absolute",
    bottom: 20,
    left: 20,
  },
  panicButtonContainer: {
    position: "absolute",
    bottom: 20,
    left: 20,
  },
  panicButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#272727ff",
    justifyContent: "center",
    alignItems: "center",
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
  floatingButtonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minWidth: 120,
    gap: 12,
    backgroundColor: "#272727ff",
    padding: 13,
    borderRadius: 20,
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
  modalContent: {
    flex: 1,
    backgroundColor: "#090909ff",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    backgroundColor: "rgba(38, 35, 35, 0.2)",
  },
  modalTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 10,
    marginTop: 30,
  },
  emptyText: {
    fontSize: 18,
    color: "#666",
    fontWeight: "600",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#444",
  },
});
