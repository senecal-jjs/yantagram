import { IconSymbol } from "@/components/ui/icon-symbol";
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
import { Member } from "@/treekem/member";
import { UUID } from "@/types/utility";
import { randomUUID } from "expo-crypto";
import { useRouter } from "expo-router";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

export default function NameGroupScreen() {
  const router = useRouter();
  const { groupName, setGroupName, selectedMembers, reset } =
    useGroupCreation();
  const { member, saveMember } = useCredentials();
  const { getRepo } = useRepos();
  const groupMembersRepo = getRepo<GroupMembersRepository>(
    GroupMembersRepositoryToken,
  );
  const groupsRepo = getRepo<GroupsRepository>(GroupsRepositoryToken);
  const { sendAmigoWelcome } = useMessageSender();

  const handleClose = () => {
    router.back();
  };

  const handleCreate = async () => {
    if (!groupName.trim() || selectedMembers.length === 0 || !member) {
      console.error("Missing required data for group creation");
      return;
    }

    try {
      // Group capacity = creator + selected members
      const groupCapacity = selectedMembers.length + 1;

      // group members will share this ID via the welcome message
      // members of the group can give the group whatever name they want on their own device
      const groupId = randomUUID();

      // Create the group with TreeKEM
      member.createGroup(groupCapacity, groupId, 1);

      // Add creator to the group
      await member.addToGroup(groupId);

      // Save updated member state with new group
      await saveMember();

      const group = await groupsRepo.create(groupId, groupName);

      selectedMembers.forEach((selection) => {
        groupMembersRepo.add(group.id, selection.id);
        sendWelcomeMessage(selection, member, group.id);
      });

      console.log(
        "Group created:",
        groupName,
        "with capacity:",
        groupCapacity,
        "members:",
        selectedMembers.map((m) => m.pseudonym),
      );

      reset(); // Clear the group members context after creation

      router.navigate({
        pathname: "/chats/[chatId]",
        params: { chatId: group.id },
      });
    } catch (error) {
      console.error("Failed to create group:", error);
      // TODO: Show error alert to user
    }
  };

  const sendWelcomeMessage = async (
    contact: Contact,
    initiatingMember: Member,
    groupId: UUID,
  ) => {
    const welcomeMessage = await initiatingMember.sendWelcomeMessage(
      {
        verificationKey: contact.verificationKey,
        pseudonym: contact.pseudonym,
        signature: contact.signature,
        ecdhPublicKey: contact.ecdhPublicKey,
      },
      groupId,
    );
    sendAmigoWelcome(welcomeMessage);
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={handleClose} style={styles.backButton}>
            <IconSymbol size={25} name="chevron.left" color={"white"} />
          </Pressable>
          <Text style={styles.headerTitle}>Name Group</Text>
          <Pressable onPress={handleCreate} disabled={!groupName.trim()}>
            <Text
              style={[
                styles.createButton,
                !groupName.trim() && styles.createButtonDisabled,
              ]}
            >
              Create
            </Text>
          </Pressable>
        </View>

        <View style={styles.formContainer}>
          <View style={styles.inputContainer}>
            <View style={styles.avatarPlaceholder}>
              <IconSymbol size={28} name="person.3.fill" color="#666" />
            </View>
            <TextInput
              style={styles.input}
              placeholder="Group Name (Required)"
              placeholderTextColor="#666"
              value={groupName}
              onChangeText={setGroupName}
              autoFocus
              maxLength={50}
            />
          </View>

          <View style={styles.membersSection}>
            <Text style={styles.sectionTitle}>
              Members ({selectedMembers.length})
            </Text>
            <View style={styles.membersContainer}>
              <FlatList
                data={selectedMembers}
                keyExtractor={(item) => item.id.toString()}
                scrollEnabled={false}
                ItemSeparatorComponent={() => (
                  <View style={styles.memberSeparator} />
                )}
                renderItem={({ item }) => (
                  <View style={styles.memberItem}>
                    <View style={styles.memberAvatar}>
                      <Text style={styles.memberAvatarText}>
                        {item.pseudonym.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>{item.pseudonym}</Text>
                      <Text style={styles.memberKey} numberOfLines={1}>
                        {item.verificationKey
                          .slice(0, 8)
                          .reduce(
                            (acc, byte) =>
                              acc + byte.toString(16).padStart(2, "0"),
                            "",
                          )}
                        ...
                      </Text>
                    </View>
                  </View>
                )}
              />
            </View>
          </View>
        </View>
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
  container: {
    flex: 1,
    backgroundColor: "#090909ff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
  },
  headerTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
  createButton: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  createButtonDisabled: {
    color: "#666",
  },
  formContainer: {
    padding: 20,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(38, 35, 35, 0.3)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    paddingLeft: 15,
    marginBottom: 10,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#444",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  input: {
    flex: 1,
    padding: 15,
    paddingLeft: 0,
    fontSize: 16,
    color: "white",
  },
  membersSection: {
    marginTop: 20,
  },
  sectionTitle: {
    color: "#888",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 10,
    textTransform: "uppercase",
  },
  membersContainer: {
    backgroundColor: "rgba(38, 35, 35, 0.3)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    overflow: "hidden",
  },
  memberItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
  },
  memberSeparator: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginLeft: 64,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#333",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  memberAvatarText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  memberKey: {
    color: "#666",
    fontSize: 12,
    fontFamily: "monospace",
  },
});
