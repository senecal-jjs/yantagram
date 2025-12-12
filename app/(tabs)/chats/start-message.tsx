import ContactList from "@/components/contact-list";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Contact } from "@/repos/specs/contacts-repository";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

export default function StartMessageScreen() {
  const router = useRouter();

  const handleClose = () => {
    router.back();
  };

  const handleContactPress = (contact: Contact) => {
    router.replace({
      pathname: "/chats/[chatId]",
      params: { chatId: contact.id },
    });
  };

  const handleNewGroupPress = () => {
    router.navigate({
      pathname: "/chats/select-group",
    });
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.modalContent}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>New Message</Text>
          <Pressable onPress={handleClose}>
            <IconSymbol size={32} name="x.circle" color={"white"} />
          </Pressable>
        </View>

        <View style={styles.buttonContainer}>
          <Pressable style={styles.button} onPress={handleNewGroupPress}>
            <IconSymbol size={38} name="person.2" color={"white"}></IconSymbol>
            <Text style={styles.buttonDesc}>New Group</Text>
            <IconSymbol
              size={15}
              name="chevron.right"
              color={"#dededeff"}
              style={{ marginLeft: "auto", marginRight: 10 }}
            ></IconSymbol>
          </Pressable>
        </View>
        <ContactList onContactPress={handleContactPress} />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  buttonDesc: {
    color: "white",
    marginLeft: 18,
    fontSize: 16,
    fontWeight: "600",
  },
  buttonContainer: {
    paddingLeft: 20,
    paddingTop: 5,
    paddingBottom: 5,
    marginLeft: 10,
    marginRight: 10,
    marginBottom: 10,
    marginTop: 10,
    borderRadius: 20,
    backgroundColor: "#333",
  },
  button: {
    // padding: 15,
    flexDirection: "row",
    height: 60,
    color: "white",
    alignItems: "center",
  },
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
  },
});
