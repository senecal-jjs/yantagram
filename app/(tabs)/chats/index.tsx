import ContactList from "@/components/contact-list";
import ConversationItem from "@/components/conversation";
import QRModal from "@/components/qr-modal";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Contact } from "@/repos/specs/contacts-repository";
import { Conversation } from "@/types/global";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

const mockConversations = [
  {
    id: "1",
    name: "Alice",
    lastMessage: "Hey, how are you?",
    timestamp: "10:30 AM",
  },
  { id: "2", name: "Bob", lastMessage: "Sounds good!", timestamp: "Yesterday" },
  {
    id: "3",
    name: "Charlie",
    lastMessage: "See you there.",
    timestamp: "Tuesday",
  },
];

export default function TabTwoScreen() {
  const router = useRouter();
  const [showQRModal, setShowQRModal] = useState(false);
  const [showContactList, setShowContactList] = useState(false);

  const handleOpenModal = () => {
    setShowQRModal(true);
  };

  const handleContactPress = (contact: Contact) => {
    console.log("Contact selected:", contact.pseudonym);
    setShowContactList(false);
    // TODO: Navigate to chat with contact or create new conversation
    router.navigate({
      pathname: "/chats/[chatId]",
      params: { chatId: contact.id },
    });
  };

  const startNewMessage = () => {
    router.navigate({
      pathname: "/chats/start-message",
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
        <FlatList
          data={mockConversations}
          showsVerticalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
        />

        <QRModal
          showQRModal={showQRModal}
          handleClose={() => setShowQRModal(false)}
        />

        <Modal
          visible={showContactList}
          transparent
          animationType="fade"
          onRequestClose={() => setShowContactList(false)}
        >
          <SafeAreaProvider>
            <SafeAreaView style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>New Message</Text>
                <Pressable onPress={() => setShowContactList(false)}>
                  <IconSymbol size={32} name="x.circle" color={"white"} />
                </Pressable>
              </View>
              <ContactList onContactPress={handleContactPress} />
            </SafeAreaView>
          </SafeAreaProvider>
        </Modal>
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
});
