import ContactList from "@/components/contact-list";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Contact } from "@/repos/specs/contacts-repository";
import { PropsWithChildren } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

type Props = PropsWithChildren<{
  showNewMessageModal: boolean;
  handleClose: () => void;
  handleContactPress: (contact: Contact) => void;
}>;

export default function NewMessageModal({
  showNewMessageModal,
  handleClose,
  handleContactPress,
}: Props) {
  return (
    <Modal
      visible={showNewMessageModal}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <SafeAreaProvider>
        <SafeAreaView style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Message</Text>
            <Pressable onPress={handleClose}>
              <IconSymbol size={32} name="x.circle" color={"white"} />
            </Pressable>
          </View>
          <ContactList onContactPress={handleContactPress} />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContent: {
    flex: 1,
    backgroundColor: "#090909ff",
  },
  modalTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    backgroundColor: "rgba(38, 35, 35, 0.2)",
  },
});
