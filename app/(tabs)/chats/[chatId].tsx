import * as Crypto from "expo-crypto";
import { useLocalSearchParams, useNavigation } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { ChatBubble } from "@/components/chat-bubble";
import { useGroupMessages } from "@/hooks/use-group-messages";
import { useMessageSender } from "@/hooks/use-message-sender";
import { Message } from "@/types/global";
import { secureFetch } from "@/utils/secure-store";

// TODO (create during onboarding)
// getRandomBytes(8).then((bytes) => secureStore("peerId", bytes.toString()));

export default function Chat() {
  const navigation = useNavigation();
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const [peerId, setPeerId] = useState<string | null>(null);
  const { sendMessage } = useMessageSender();
  const { messages, isLoading, isLoadingMore, hasMore, loadMore } =
    useGroupMessages(chatId);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    navigation.setOptions({
      title: "Contact",
    });
  }, [navigation]);

  useEffect(() => {
    console.log("fetching peer id");
    secureFetch("peerId").then((peerId) => setPeerId(peerId));
  }, []);

  const renderMessage = ({ item }: { item: Message }) => {
    return <ChatBubble message={item} peerId={peerId!} />;
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
    if (newMessage.trim()) {
      const newMsg: Message = {
        id: Crypto.randomUUID(),
        groupId: chatId,
        sender: "1",
        contents: newMessage,
        timestamp: Date.now(),
      };

      setNewMessage("");
      sendMessage(newMsg);

      // dismiss the keyboard after sending
      Keyboard.dismiss();
    }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.mainContainer}>
        <KeyboardAvoidingView
          style={styles.keyboardAvoidingView}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
        >
          <FlatList
            ref={flatListRef}
            data={messages}
            showsVerticalScrollIndicator={false}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            onContentSizeChange={() => {
              flatListRef.current?.scrollToEnd({ animated: true });
            }}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={renderFooter}
            inverted={false}
            maintainVisibleContentPosition={{
              minIndexForVisible: 0,
            }}
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
            <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
              <Text>Send</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
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
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    backgroundColor: "#090909ff",
    color: "white",
    borderRadius: 25,
    paddingHorizontal: 15,
    paddingTop: 10,
    paddingBottom: 10,
    maxHeight: 120,
    borderColor: "rgba(172, 169, 169, 0.2)",
    borderWidth: 1,
  },
  sendButton: {
    marginLeft: 10,
    backgroundColor: "#0B93F6",
    borderRadius: 25,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingFooter: {
    paddingVertical: 20,
    alignItems: "center",
  },
});
