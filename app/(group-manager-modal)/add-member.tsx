import { Member } from "@/amigo/member";
import MemberSelection from "@/components/member-selection";
import { useCredentials } from "@/contexts/credential-context";
import { useGroupCreation } from "@/contexts/group-creation-context";
import {
    GroupMembersRepositoryToken,
    GroupsRepositoryToken,
    useRepos,
} from "@/contexts/repository-context";
import { useMessageSender } from "@/hooks/use-message-sender";
import { Contact } from "@/repos/specs/contacts-repository";
import { GroupMembersRepository } from "@/repos/specs/group-members-repository";
import GroupsRepository from "@/repos/specs/groups-repository";
import { UUID } from "@/types/utility";
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
  const { member } = useCredentials();
  const { getRepo } = useRepos();
  const groupMembersRepo = getRepo<GroupMembersRepository>(
    GroupMembersRepositoryToken,
  );
  const groupsRepo = getRepo<GroupsRepository>(GroupsRepositoryToken);
  const { sendAmigoWelcome } = useMessageSender();

  const handleClose = () => {
    router.back();
  };

  const handleNextPress = async () => {
    console.log("updating group members");

    if (!member) {
      throw new Error("Missing member state");
    }

    const group = await groupsRepo.get(groupId);

    if (!group) {
      throw new Error(`Cannot find group: ${groupId}`);
    }

    selectedMembers.forEach((selection) => {
      groupMembersRepo.add(groupId, selection.id);
      sendWelcomeMessage(selection, member, groupId, group.name);
    });

    router.dismissTo({
      pathname: "/chats/[chatId]",
      params: { chatId: groupId },
    });
  };

  const sendWelcomeMessage = async (
    contact: Contact,
    initiatingMember: Member,
    groupId: UUID,
    groupName: string,
  ) => {
    const welcomeMessage = await initiatingMember.sendWelcomeMessage(
      {
        verificationKey: contact.verificationKey,
        pseudonym: contact.pseudonym,
        signature: contact.signature,
        ecdhPublicKey: contact.ecdhPublicKey,
      },
      groupId,
      groupName,
    );
    sendAmigoWelcome(welcomeMessage);
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
