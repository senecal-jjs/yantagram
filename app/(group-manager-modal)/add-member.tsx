import MemberSelection from "@/components/member-selection";
import { useGroupCreation } from "@/contexts/group-creation-context";
import { useRepos } from "@/contexts/repository-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

export default function AddMemberScreen() {
  const router = useRouter();
  const { groupId, existingMemberIds } = useLocalSearchParams<{
    groupId: string;
    existingMemberIds: string;
  }>();
  const memberIds = existingMemberIds.split(",").map(Number);
  const { selectedMembers, setSelectedMembers } = useGroupCreation();
  const { getRepo } = useRepos();

  const handleClose = () => {
    router.back();
  };

  const handleNextPress = () => {
    console.log("updating group members");
    router.dismissTo({
      pathname: "/chats/[chatId]",
      params: { chatId: groupId },
    });
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView>
        <MemberSelection
          handleClose={handleClose}
          handleNextPress={handleNextPress}
          selectedMembers={selectedMembers}
          nextLanguage="Update"
          setSelectedMembers={setSelectedMembers}
          contactsToRemove={memberIds}
        ></MemberSelection>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
