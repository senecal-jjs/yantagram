import * as Crypto from "expo-crypto";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { ChatBubble } from "@/components/chat-bubble";
import { BackButton } from "@/components/ui/back-button";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useCredential } from "@/contexts/credential-context";
import {
  ContactsRepositoryToken,
  GroupMembersRepositoryToken,
  GroupsRepositoryToken,
  MessagesRepositoryToken,
  useRepos,
} from "@/contexts/repository-context";
import { useGroupMessages } from "@/hooks/use-group-messages";
import { useMessageSender } from "@/hooks/use-message-sender";
import ContactsRepository, { Contact } from "@/repos/specs/contacts-repository";
import { GroupMembersRepository } from "@/repos/specs/group-members-repository";
import GroupsRepository, { Group } from "@/repos/specs/groups-repository";
import MessagesRepository from "@/repos/specs/messages-repository";
import { Message, MessageWithPseudonym } from "@/types/global";
import { uint8ArrayToHexString } from "@/utils/string";

type MessageItem =
  | { type: "message"; data: MessageWithPseudonym }
  | { type: "dateSeparator"; timestamp: number; label: string };

export default function Chat() {
  const router = useRouter();
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const { member } = useCredential();
  const { sendMessage } = useMessageSender();
  const { messages, isLoading, isLoadingMore, hasMore, loadMore } =
    useGroupMessages(chatId);
  const [groupName, setGroupName] = useState("Unknown Group");
  const [group, setGroup] = useState<Group | null>(null);
  const [groupMembers, setGroupMembers] = useState<Contact[]>([]);
  const { getRepo } = useRepos();
  const groupsRepo = getRepo<GroupsRepository>(GroupsRepositoryToken);
  const groupMembersRepo = getRepo<GroupMembersRepository>(
    GroupMembersRepositoryToken,
  );
  const contactsRepo = getRepo<ContactsRepository>(ContactsRepositoryToken);
  const messagesRepo = getRepo<MessagesRepository>(MessagesRepositoryToken);
  const flatListRef = useRef<FlatList>(null);

  // Process messages with date separators
  const messagesWithSeparators: MessageItem[] = React.useMemo(() => {
    const items: MessageItem[] = [];
    const threshold = 5 * 60 * 1000; // 5 minutes threshold

    for (let i = 0; i < messages.length; i++) {
      const currentMessage = messages[i];
      const previousMessage = i > 0 ? messages[i - 1] : null;

      // Check if we need a date separator
      if (
        !previousMessage ||
        currentMessage.message.timestamp - previousMessage.message.timestamp >
          threshold
      ) {
        const date = new Date(currentMessage.message.timestamp);
        const now = Date.now();
        const diff = now - currentMessage.message.timestamp;
        const millisDay = 86_400_000;

        let label = "";
        if (
          diff < millisDay &&
          date.toDateString() === new Date().toDateString()
        ) {
          // Today - show time only
          label = date.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          });
        } else if (diff < millisDay * 7) {
          // Less than a week - show day and time
          label =
            date.toLocaleDateString("en-US", { weekday: "long" }) +
            " " +
            date.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            });
        } else {
          // Older - show full date and time
          label =
            date.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year:
                date.getFullYear() !== new Date().getFullYear()
                  ? "numeric"
                  : undefined,
            }) +
            " at " +
            date.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            });
        }

        items.push({
          type: "dateSeparator",
          timestamp: currentMessage.message.timestamp,
          label,
        });
      }

      items.push({
        type: "message",
        data: currentMessage,
      });
    }

    return items;
  }, [messages]);

  useEffect(() => {
    async function getGroupName() {
      const group = await groupsRepo.get(chatId);

      if (group) {
        setGroupName(group.name);
        setGroup(group);
      }

      const members = await groupMembersRepo.getByGroup(chatId);
      const contactPromises = members.map(async (member) =>
        contactsRepo.get(member.contactId),
      );
      const contacts = await Promise.all(contactPromises);

      if (contacts.includes(null)) {
        throw new Error("Failed to find contacts for all group members");
      }

      setGroupMembers(contacts.filter((contact) => contact !== null));
    }

    getGroupName();
  }, [chatId]);

  const renderItem = ({ item }: { item: MessageItem }) => {
    if (item.type === "dateSeparator") {
      return (
        <View style={styles.dateSeparatorContainer}>
          <Text style={styles.dateSeparatorText}>{item.label}</Text>
        </View>
      );
    }

    // mark as read, but don't notify listener to prevent re-render loop
    messagesRepo.markAsRead(item.data.message.id, false);
    return (
      <ChatBubble
        message={item.data.message}
        contactPseudonym={item.data.pseudonym}
        showPseudonym={groupMembers.length > 1}
        verificationKey={uint8ArrayToHexString(
          member?.credential.verificationKey!,
        )}
      />
    );
  };

  const renderFooter = () => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.loadingFooter}>
        <Text style={{ color: "gray" }}>Loading more messages...</Text>
      </View>
    );
  };

  const handleLoadMore = () => {
    if (hasMore && !isLoadingMore) {
      loadMore();
    }
  };

  // State for the new message input
  const [newMessage, setNewMessage] = useState("");

  const handleSend = () => {
    if (!member) {
      throw new Error("Member state is missing");
    }

    if (newMessage.trim()) {
      const newMsg: Message = {
        id: Crypto.randomUUID(),
        groupId: chatId,
        sender: uint8ArrayToHexString(member.credential.verificationKey),
        contents: newMessage,
        timestamp: Date.now(),
      };

      setNewMessage("");
      sendMessage(newMsg);
    }
  };

  const onAvatarPress = () => {
    // Don't navigate to group details for non-expandable groups (1:1 private chats)
    if (!group?.expandable) {
      return;
    }

    router.navigate({
      pathname: "/(group-manager-modal)/group-details",
      params: { groupId: chatId },
    });
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.mainContainer}>
        <View style={styles.chatHeader}>
          <BackButton
            onPress={() => {
              router.back();
            }}
          />
          <View style={styles.headerCenter}>
            <Pressable onPress={onAvatarPress} disabled={!group?.expandable}>
              <View style={styles.avatarBubble}>
                <Text style={styles.avatarText}>{groupName.at(0)}</Text>
              </View>
              <View style={styles.pressableName}>
                <Text style={styles.headerText}>{groupName}</Text>
                {group?.expandable && (
                  <IconSymbol
                    size={12}
                    name="chevron.right"
                    color={"white"}
                  ></IconSymbol>
                )}
              </View>
            </Pressable>
          </View>
          <View style={styles.headerSpacer}></View>
        </View>

        <KeyboardAvoidingView
          style={styles.keyboardAvoidingView}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 5 : 0}
        >
          <FlatList
            ref={flatListRef}
            data={messagesWithSeparators}
            showsVerticalScrollIndicator={true}
            renderItem={renderItem}
            keyExtractor={(item, index) =>
              item.type === "message"
                ? item.data.message.id
                : `separator-${item.timestamp}-${index}`
            }
            onContentSizeChange={() => {
              flatListRef.current?.scrollToEnd({ animated: true });
            }}
            onLayout={() => {
              flatListRef.current?.scrollToEnd({ animated: true });
            }}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={renderFooter}
            inverted={false}
            maintainVisibleContentPosition={{
              minIndexForVisible: 0,
            }}
            contentContainerStyle={{ paddingRight: 5 }}
          />
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={newMessage}
              onChangeText={setNewMessage}
              placeholder="What's on your mind?"
              placeholderTextColor="gray"
              multiline
              allowFontScaling={true}
            />
            <Pressable
              style={[
                styles.sendButton,
                !newMessage.trim() && styles.sendButtonDisabled,
              ]}
              onPress={handleSend}
              disabled={!newMessage.trim()}
            >
              <IconSymbol
                size={20}
                name="arrow.up"
                color={newMessage.trim() ? "white" : "#666"}
              />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  chatHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    paddingHorizontal: 15,
    position: "relative",
  },
  headerCenter: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  avatarBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "black",
    borderColor: "white",
    borderWidth: 2,
    marginBottom: -7,
    alignSelf: "center",
    zIndex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  pressableName: {
    flexDirection: "row",
    alignItems: "center",
    borderColor: "white",
    borderWidth: 1,
    borderRadius: 15,
    padding: 5,
    backgroundColor: "rgba(93, 93, 93, 0.5)",
    zIndex: 0,
  },
  headerText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  headerSpacer: {
    width: 38,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  message: {
    backgroundColor: "#2377F1",
    borderRadius: "20px",
  },
  mainContainer: {
    flex: 1,
    backgroundColor: "#090909ff",
    paddingTop: 10,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 10,
    paddingVertical: 8,
    position: "relative",
  },
  input: {
    flex: 1,
    fontSize: 18,
    fontWeight: 500,
    lineHeight: 22,
    backgroundColor: "#272727ff",
    color: "white",
    borderRadius: 25,
    paddingHorizontal: 15,
    paddingRight: 45,
    paddingTop: 10,
    paddingBottom: 10,
    maxHeight: 120,
    borderWidth: 1.5,
    borderColor: "rgba(172, 169, 169, 0.2)",
    borderTopColor: "rgba(255, 255, 255, 0.3)",
    borderLeftColor: "rgba(255, 255, 255, 0.25)",
    shadowColor: "#fff",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  sendButton: {
    position: "absolute",
    right: 15,
    bottom: 12,
    backgroundColor: "#0B93F6",
    borderRadius: 20,
    width: 37,
    height: 37,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#444",
  },
  loadingFooter: {
    paddingVertical: 20,
    alignItems: "center",
  },
  dateSeparatorContainer: {
    alignItems: "center",
    marginVertical: 15,
  },
  dateSeparatorText: {
    color: "#888",
    fontSize: 12,
    fontWeight: "500",
  },
});
