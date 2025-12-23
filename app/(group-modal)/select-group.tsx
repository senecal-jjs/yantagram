import MemberSelection from "@/components/member-selection";
import { useGroupCreation } from "@/contexts/group-creation-context";
import { useNavigation, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, StyleSheet } from "react-native";
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

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <MemberSelection
          handleClose={handleClose}
          handleNextPress={handleNextPress}
          selectedMembers={selectedMembers}
          nextLanguage="Next"
          setSelectedMembers={setSelectedMembers}
          contactsToRemove={[]}
        ></MemberSelection>
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
