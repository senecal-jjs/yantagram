import ConversationItem from "@/components/conversation";
import QRModal from "@/components/qr-modal";
import { BounceButton } from "@/components/ui/bounce-button";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useCredentials } from "@/contexts/credential-context";
import {
  ContactsRepositoryToken,
  GroupsRepositoryToken,
  MessagesRepositoryToken,
  RelayPacketsRepositoryToken,
  useRepos,
} from "@/contexts/repository-context";
import { useSettings } from "@/contexts/settings-context";
import { dbListener } from "@/repos/db-listener";
import ContactsRepository from "@/repos/specs/contacts-repository";
import GroupsRepository from "@/repos/specs/groups-repository";
import MessagesRepository from "@/repos/specs/messages-repository";
import RelayPacketsRepository from "@/repos/specs/relay-packets-repository";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
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
  const { deleteMember, member, saveMember } = useCredentials();
  const { resetSettings } = useSettings();
  const [showQRModal, setShowQRModal] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [searchHighlight, setSearchHighlight] = useState(false);
  const [dismissHighlight, setDismissHighlight] = useState(false);
  const { getRepo } = useRepos();
  const groupsRepo = getRepo<GroupsRepository>(GroupsRepositoryToken);
  const messagesRepo = getRepo<MessagesRepository>(MessagesRepositoryToken);
  const contactsRepo = getRepo<ContactsRepository>(ContactsRepositoryToken);
  const relayPacketsRepo = getRepo<RelayPacketsRepository>(
    RelayPacketsRepositoryToken,
  );
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
        await groupsRepo.deleteAll();
        await contactsRepo.deleteAll();
        await relayPacketsRepo.deleteAll();
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
      // type error is due to difference between browser and nodejs types
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
        lastMessage = group.admin
          ? "You started a group"
          : "You've been added to a group";
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
    dbListener.onContactUpdate(fetchConversations);

    // Keyboard listeners
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => {
        setKeyboardOffset(e.endCoordinates.height);
      },
    );
    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => {
        setKeyboardOffset(0);
      },
    );

    // Cleanup listener on unmount
    return () => {
      dbListener.removeGroupCreationListener(fetchConversations);
      dbListener.removeGroupUpdateListener(fetchConversations);
      dbListener.removeMessageChangeListener(fetchConversations);
      dbListener.removeContactUpdateListener(fetchConversations);
      keyboardWillShow.remove();
      keyboardWillHide.remove();
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

  const filteredConversations = conversations.filter((conversation) =>
    conversation.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleDeleteChat = async (chatId: string) => {
    try {
      // Remove group from cryptographic member state
      if (member) {
        member.removeGroup(chatId);
        await saveMember();
      }
      // Delete the group from database (cascade will remove group_members)
      await groupsRepo.delete(chatId);
      // Refresh the conversations list
      fetchConversations();
    } catch (error) {
      console.error("Failed to delete chat:", error);
    }
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
      onDelete={handleDeleteChat}
    />
  );

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.mainContainer}>
        <View style={styles.header}>
          <BounceButton style={styles.logoContainer} onPress={onSettingsPress}>
            <View style={styles.logoButton}>
              <View style={styles.logoAvatar}></View>
              <Text style={styles.logoText}>Yantagram</Text>
            </View>
          </BounceButton>

          <BounceButton style={styles.panicButton} onPress={handlePanicButton}>
            <Text style={{ color: "red" }}>WIPE</Text>
          </BounceButton>
        </View>

        <View
          style={[
            styles.searchContainer,
            {
              bottom: keyboardOffset > 0 ? keyboardOffset - 70 : 20,
              right: keyboardOffset > 0 ? 70 : undefined,
              minWidth: keyboardOffset > 0 ? undefined : 200,
              backgroundColor: searchHighlight
                ? "rgba(60, 60, 60, 0.5)"
                : keyboardOffset > 0
                  ? "rgba(39, 39, 39, 0.95)"
                  : "rgba(39, 39, 39, 0.3)",
              shadowColor: searchHighlight
                ? "#fff"
                : "rgba(255, 255, 255, 0.1)",
              shadowOpacity: searchHighlight ? 0.25 : 1,
              shadowRadius: searchHighlight ? 5 : 2,
            },
          ]}
        >
          <IconSymbol
            size={18}
            name="magnifyingglass"
            color="#888"
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search chats..."
            placeholderTextColor="#888"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onPressIn={() => {
              if (keyboardOffset === 0) {
                setSearchHighlight(true);
                setTimeout(() => setSearchHighlight(false), 150);
              }
            }}
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={() => setSearchQuery("")}
              style={styles.clearButton}
            >
              <IconSymbol size={20} name="xmark.circle.fill" color="#888" />
            </Pressable>
          )}
        </View>

        {keyboardOffset > 0 && (
          <Pressable
            onPress={() => Keyboard.dismiss()}
            onPressIn={() => {
              setDismissHighlight(true);
              setTimeout(() => setDismissHighlight(false), 150);
            }}
            style={[
              styles.dismissButtonContainer,
              {
                bottom: keyboardOffset > 0 ? keyboardOffset - 70 : 20,
                backgroundColor: dismissHighlight
                  ? "rgba(150, 150, 150, 0.95)"
                  : "rgba(39, 39, 39, 0.95)",
                shadowColor: dismissHighlight
                  ? "#fff"
                  : "rgba(255, 255, 255, 0.1)",
                shadowOpacity: dismissHighlight ? 0.6 : 1,
                shadowRadius: dismissHighlight ? 10 : 2,
              },
            ]}
          >
            <IconSymbol
              size={24}
              name="keyboard.chevron.compact.down"
              color="#888"
            />
          </Pressable>
        )}

        {conversations.length > 0 && (
          <FlatList
            data={filteredConversations}
            showsVerticalScrollIndicator={false}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            style={{ marginTop: 20 }}
            contentContainerStyle={{ paddingBottom: 100 }}
          />
        )}
        {conversations.length <= 0 && (
          <Pressable
            style={styles.emptyContainer}
            onPress={() => Keyboard.dismiss()}
          >
            <Text style={styles.emptyText}>No chats yet</Text>
            <Text style={styles.emptySubtext}>
              Tap the new message icon to start a chat
            </Text>
          </Pressable>
        )}

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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    zIndex: 1001,
    elevation: 1001,
  },
  logoButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoContainer: {
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
  searchContainer: {
    position: "absolute",
    bottom: 20,
    left: 20,
    backgroundColor: "rgba(39, 39, 39, 0.3)",
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
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 200,
    height: 53,
    zIndex: 1000,
    elevation: 1000,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: "white",
    fontSize: 16,
  },
  clearButton: {
    marginLeft: 8,
    padding: 2,
  },
  dismissButtonContainer: {
    position: "absolute",
    left: 330,
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
    width: 50,
    height: 53,
    alignItems: "center",
    justifyContent: "center",
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
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
