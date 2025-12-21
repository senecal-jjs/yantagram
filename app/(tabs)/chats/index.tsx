import ConversationItem from "@/components/conversation";
import QRModal from "@/components/qr-modal";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  GroupsRepositoryToken,
  MessagesRepositoryToken,
  useRepos,
} from "@/contexts/repository-context";
import { dbListener } from "@/repos/db-listener";
import GroupsRepository from "@/repos/specs/groups-repository";
import MessagesRepository from "@/repos/specs/messages-repository";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

export type Conversation = {
  id: string;
  name: string;
  lastMessage: string;
  hasUnread: boolean;
  timestamp: string;
};

export default function TabTwoScreen() {
  const router = useRouter();
  const [showQRModal, setShowQRModal] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const { getRepo } = useRepos();
  const groupsRepo = getRepo<GroupsRepository>(GroupsRepositoryToken);
  const messagesRepo = getRepo<MessagesRepository>(MessagesRepositoryToken);

  const fetchConversations = async () => {
    const groups = await groupsRepo.list();

    const conversationPromises = groups.map(async (group) => {
      console.log("building conversations");
      // Get last message for this group
      const lastMessageData = await messagesRepo.getByGroupId(group.id, 1, 0);
      const hasUnread = await messagesRepo.hasUnreadInGroup(group.id);

      let lastMessage = "";
      let timestamp = "";

      if (lastMessageData.length > 0) {
        lastMessage = lastMessageData[0].contents;
        timestamp = formatTimestamp(lastMessageData[0].timestamp);
      } else {
        lastMessage = "No messages yet";
        timestamp = formatTimestamp(group.createdAt);
      }

      return {
        id: group.id,
        name: group.name,
        lastMessage,
        hasUnread,
        timestamp,
      };
    });

    const fetchedConversations = await Promise.all(conversationPromises);
    setConversations(fetchedConversations);
  };

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
  }, []);

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

  const handleOpenModal = () => {
    setShowQRModal(true);
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
        <View style={styles.chatHeader}>
          <Pressable onPress={handleOpenModal}>
            <IconSymbol size={28} name="qrcode" color={"white"}></IconSymbol>
          </Pressable>
          <Text style={styles.headerText}>Chats</Text>
          <Pressable onPress={() => startNewMessage()}>
            <IconSymbol
              size={28}
              name="square.and.pencil"
              color={"white"}
            ></IconSymbol>
          </Pressable>
        </View>
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
              Tap the new message icon at the top right to start a chat
            </Text>
          </View>
        )}
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
  chatHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    padding: 15,
    backgroundColor: "rgba(38, 35, 35, 0.2)",
  },
  headerText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
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
