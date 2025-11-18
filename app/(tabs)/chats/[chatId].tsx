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
import { useRepos } from "@/components/repository-context";
import { COLOR_CHARACTERISTIC_UUID, DATA_SERVICE_UUID } from "@/hooks/use-ble";
import useMessaging from "@/hooks/use-ble-messaging";
import { DeliveryStatus, Message } from "@/types/global";
import { getRandomBytes } from "@/utils/random";
import { secureFetch, secureStore } from "@/utils/secure-store";

// TODO (create during onboarding)
getRandomBytes(8).then((bytes) => secureStore("peerId", bytes.toString()));

export default function Chat() {
  const { getRepo } = useRepos();
  const messagesRepo = getRepo("messagesRepo");
  const navigation = useNavigation();
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const { sendMessage } = useMessaging(
    DATA_SERVICE_UUID,
    COLOR_CHARACTERISTIC_UUID,
  );
  const [peerId, setPeerId] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({
      title: "Contact",
    });
  }, [navigation]);

  useEffect(() => {
    secureFetch("peerId").then((peerId) => setPeerId(peerId));
  }, []);

  useEffect(() => {
    const initialFetchData = async (limit: number) => {
      const initialMessages = await messagesRepo.getAll(limit);
      setMessages(initialMessages);
    };

    const fetchData = async () => {
      const initialMessages = await messagesRepo.getAll(1);
      setMessages([...messages, ...initialMessages]);
    };

    initialFetchData(50);

    const intervalId = setInterval(fetchData, 1000);

    return () => clearInterval(intervalId);
  }, []);

  const renderMessage = ({ item }: { item: Message }) => {
    return <ChatBubble message={item} peerId={peerId!} />;
  };

  const [messages, setMessages] = useState<Message[]>([
    // {
    //   id: Math.random().toString(),
    //   sender: "1",
    //   contents: "hello",
    //   timestamp: Date.now(),
    //   isRelay: false,
    //   originalSender: "1",
    //   isPrivate: true,
    //   recipientNickname: "ace",
    //   senderPeerId: "1",
    //   deliveryStatus: DeliveryStatus.SENT,
    // },
    // {
    //   id: Math.random().toString(),
    //   sender: "1",
    //   contents: "hello back",
    //   timestamp: Date.now(),
    //   isRelay: false,
    //   originalSender: "1",
    //   isPrivate: true,
    //   recipientNickname: "ace",
    //   senderPeerId: peerId,
    //   deliveryStatus: DeliveryStatus.SENT,
    // },
  ]);

  // State for the new message input
  const [newMessage, setNewMessage] = useState("");

  // A ref to automatically scroll the message list
  const flatListRef = useRef<FlatList>(null);

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

      setMessages([...messages, newMsg]);
      setNewMessage("");
      sendMessage(newMsg, peerId!, "recip");

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
