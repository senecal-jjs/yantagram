import ContactList from "@/components/contact-list";
import { BackButton } from "@/components/ui/back-button";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useGroupCreation } from "@/contexts/group-creation-context";
import { Contact } from "@/repos/specs/contacts-repository";
import { useNavigation, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
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
  const navigation = useNavigation();
  const { selectedMembers, setSelectedMembers } = useGroupCreation();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: selectedMembers.length > 0 ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [selectedMembers.length]);

  useEffect(() => {
    const dismiss = navigation.addListener("beforeRemove", (e) => {
      setSelectedMembers([]);
    });

    return dismiss;
  }, [navigation]);

  const handleClose = () => {
    setSelectedMembers([]);
    router.back();
  };

  const handleNextPress = () => {
    router.navigate({
      pathname: "/name-group",
    });
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
          <BackButton onPress={handleClose}></BackButton>
          <Text style={styles.modalTitle}>{getTitle()}</Text>
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
  backButton: {
    backgroundColor: "rgba(90, 85, 85, 0.3)",
    borderRadius: "50%",
    padding: 8,
  },
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
