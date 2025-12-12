import ContactList from "@/components/contact-list";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Contact } from "@/repos/specs/contacts-repository";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

export default function NewGroupScreen() {
  const router = useRouter();
  const [selectedMembers, setSelectedMembers] = useState<Contact[]>([]);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: selectedMembers.length > 0 ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [selectedMembers.length]);

  const handleClose = () => {
    router.back();
  };

  const handleNextPress = () => {
    console.log("next pressed");
  };

  const onContactSelect = (contact: Contact) => {
    setSelectedMembers([...selectedMembers, contact]);
  };

  const onContactDeselect = (contact: Contact) => {
    setSelectedMembers(selectedMembers.filter((c) => c.id !== contact.id));
  };

  const getTitle = () => {
    if (selectedMembers.length === 0) {
      return "Select Members";
    } else if (selectedMembers.length === 1) {
      return "1 Member";
    } else {
      return `${selectedMembers.length} Members`;
    }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <View style={styles.modalHeader}>
          <Animated.View
            style={{
              opacity: fadeAnim,
              transform: [
                {
                  scale: fadeAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.8, 1],
                  }),
                },
              ],
            }}
            pointerEvents={selectedMembers.length > 0 ? "auto" : "none"}
          >
            <Pressable onPress={handleNextPress}>
              <Text style={styles.next}>Next</Text>
            </Pressable>
          </Animated.View>
          <Text style={styles.modalTitle}>{getTitle()}</Text>
          <Pressable onPress={handleClose}>
            <IconSymbol size={32} name="x.circle" color={"white"} />
          </Pressable>
        </View>

        {selectedMembers.length > 0 && (
          <View style={styles.selectedMembersContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.selectedMembersScroll}
            >
              {selectedMembers.map((contact) => (
                <Pressable
                  key={contact.id}
                  style={styles.selectedMemberChip}
                  onPress={() => onContactDeselect(contact)}
                >
                  <View style={styles.selectedMemberAvatar}>
                    <Text style={styles.selectedMemberAvatarText}>
                      {contact.pseudonym.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.removeIconContainer}>
                    <IconSymbol
                      size={14}
                      name="xmark.circle.fill"
                      color="#666"
                    />
                  </View>
                  <Text style={styles.selectedMemberAvatarName}>
                    {contact.pseudonym.slice(0, 8)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        <ContactList
          selectable={true}
          selectedContactIds={selectedMembers.map((m) => m.id)}
          onContactSelect={onContactSelect}
          onContactDeselect={onContactDeselect}
        ></ContactList>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  next: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
    borderColor: "white",
    borderStyle: "solid",
  },
  container: {
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
    marginBottom: 5,
  },
  selectedMembersContainer: {
    marginTop: 5,
    backgroundColor: "#090909ff",
    paddingVertical: 12,
  },
  selectedMembersScroll: {
    paddingHorizontal: 15,
    gap: 10,
  },
  selectedMemberChip: {
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
    marginRight: 10,
  },
  selectedMemberAvatar: {
    width: 30,
    height: 30,
    borderRadius: 30,
    backgroundColor: "#333",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  selectedMemberAvatarText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  selectedMemberAvatarName: {
    color: "#fff",
    marginLeft: 4,
  },
  removeIconContainer: {
    position: "absolute",
    top: 0,
    right: -2,
    backgroundColor: "#fff",
    borderRadius: 10,
  },
});
