import * as Crypto from "expo-crypto";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
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
import GroupsRepository from "@/repos/specs/groups-repository";
import MessagesRepository from "@/repos/specs/messages-repository";
import { Message, MessageWithPseudonym } from "@/types/global";
import { uint8ArrayToHexString } from "@/utils/string";

export default function Chat() {
  const navigation = useNavigation();
  const router = useRouter();
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const { member } = useCredential();
  const { sendMessage } = useMessageSender();
  const { messages, isLoading, isLoadingMore, hasMore, loadMore } =
    useGroupMessages(chatId);
  const [groupName, setGroupName] = useState("Unknown Group");
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [groupMembers, setGroupMembers] = useState<Contact[]>([]);
  const { getRepo } = useRepos();
  const groupsRepo = getRepo<GroupsRepository>(GroupsRepositoryToken);
  const groupMembersRepo = getRepo<GroupMembersRepository>(
    GroupMembersRepositoryToken,
  );
  const contactsRepo = getRepo<ContactsRepository>(ContactsRepositoryToken);
  const messagesRepo = getRepo<MessagesRepository>(MessagesRepositoryToken);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    async function getGroupName() {
      const group = await groupsRepo.get(chatId);

      if (group) {
        setGroupName(group.name);
      }

      // navigation.setOptions({
      //   title: group?.name ?? "Unknown Group",
      // });

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

  const renderMessage = ({ item }: { item: MessageWithPseudonym }) => {
    // mark as read, but don't notify listener to prevent re-render loop
    messagesRepo.markAsRead(item.message.id, false);
    return (
      <ChatBubble
        message={item.message}
        contactPseudonym={item.pseudonym}
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

      // dismiss the keyboard after sending
      Keyboard.dismiss();
    }
  };

  const onAvatarPress = () => {
    setShowMembersModal(true);
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
            <Pressable onPress={onAvatarPress}>
              <View style={styles.avatarBubble}>
                <Text style={styles.avatarText}>{groupName.at(0)}</Text>
              </View>
              <View style={styles.pressableName}>
                <Text style={styles.headerText}>{groupName}</Text>
                <IconSymbol
                  size={12}
                  name="chevron.right"
                  color={"white"}
                ></IconSymbol>
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
            data={messages}
            showsVerticalScrollIndicator={true}
            renderItem={renderMessage}
            keyExtractor={(item) => item.message.id}
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

        <Modal
          visible={showMembersModal}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowMembersModal(false)}
        >
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Group Details</Text>
              <Pressable onPress={() => setShowMembersModal(false)}>
                <IconSymbol size={32} name="x.circle" color={"white"} />
              </Pressable>
            </View>
            <View style={styles.modalContent}>
              <View style={styles.membersSection}>
                <Text style={styles.sectionTitle}>
                  Members ({groupMembers.length})
                </Text>
                <View style={styles.membersContainer}>
                  <FlatList
                    data={groupMembers}
                    keyExtractor={(item, index) => index.toString()}
                    scrollEnabled={false}
                    ItemSeparatorComponent={() => (
                      <View style={styles.memberSeparator} />
                    )}
                    renderItem={({ item }) => (
                      <View style={styles.memberItem}>
                        <View style={styles.memberAvatar}>
                          <Text style={styles.memberAvatarText}>
                            {item?.pseudonym?.charAt(0)?.toUpperCase() || "?"}
                          </Text>
                        </View>
                        <View style={styles.memberInfo}>
                          <Text style={styles.memberName}>
                            {item?.pseudonym || "Unknown"}
                          </Text>
                          <Text style={styles.memberKey} numberOfLines={1}>
                            {item?.verificationKey
                              ? item.verificationKey
                                  .slice(0, 8)
                                  .reduce(
                                    (acc, byte) =>
                                      acc + byte.toString(16).padStart(2, "0"),
                                    "",
                                  ) + "..."
                              : "Unknown"}
                          </Text>
                        </View>
                      </View>
                    )}
                  />
                </View>
              </View>
            </View>
          </SafeAreaView>
        </Modal>
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
    // backgroundColor: "rgba(38, 35, 35, 0.2)",
    position: "relative",
    // opacity: 0.5,
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
    width: 32,
    height: 32,
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
  modalContainer: {
    flex: 1,
    backgroundColor: "#090909ff",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    backgroundColor: "rgba(38, 35, 35, 0.2)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  modalTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
  modalContent: {
    padding: 20,
  },
  membersSection: {
    marginTop: 0,
  },
  sectionTitle: {
    color: "#888",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 10,
    textTransform: "uppercase",
  },
  membersContainer: {
    backgroundColor: "rgba(38, 35, 35, 0.3)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    overflow: "hidden",
  },
  memberItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
  },
  memberSeparator: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginLeft: 64,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#333",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  memberAvatarText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  memberKey: {
    color: "#666",
    fontSize: 12,
    fontFamily: "monospace",
  },
});
