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
import { useMessageProvider } from "@/contexts/message-context";
import { useMessageService } from "@/hooks/use-message-service";
import { DeliveryStatus, Message } from "@/types/global";
import { secureFetch } from "@/utils/secure-store";

// TODO (create during onboarding)
// getRandomBytes(8).then((bytes) => secureStore("peerId", bytes.toString()));

export default function Chat() {
  const navigation = useNavigation();
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const [peerId, setPeerId] = useState<string | null>(null);
  const { sendMessage } = useMessageService();
  const { messages } = useMessageProvider();
  // A ref to automatically scroll the message list
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

  // State for the new message input
  const [newMessage, setNewMessage] = useState("");

  const handleSend = () => {
    if (newMessage.trim()) {
      const newMsg: Message = {
        id: Crypto.randomUUID(),
        sender: "1",
        contents: newMessage,
        timestamp: Date.now(),
        isRelay: false,
        originalSender: "1",
        isPrivate: true,
        recipientNickname: "ace",
        senderPeerId: peerId,
        deliveryStatus: DeliveryStatus.SENDING,
      };

      setNewMessage("");
      sendMessage(newMsg, peerId!, "to");

      // scroll to the end of the list to show the new message
      flatListRef.current?.scrollToEnd({ animated: true });

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
});
