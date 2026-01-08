import { BounceButton } from "@/components/ui/bounce-button";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  ContactsRepositoryToken,
  GroupMembersRepositoryToken,
  GroupsRepositoryToken,
  useRepos,
} from "@/contexts/repository-context";
import ContactsRepository, { Contact } from "@/repos/specs/contacts-repository";
import { GroupMembersRepository } from "@/repos/specs/group-members-repository";
import GroupsRepository, { Group } from "@/repos/specs/groups-repository";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

export default function GroupDetails() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { getRepo } = useRepos();
  const groupsRepo = getRepo<GroupsRepository>(GroupsRepositoryToken);
  const groupMembersRepo = getRepo<GroupMembersRepository>(
    GroupMembersRepositoryToken,
  );
  const contactsRepo = getRepo<ContactsRepository>(ContactsRepositoryToken);

  const [group, setGroup] = useState<Group | null>(null);
  const [groupMembers, setGroupMembers] = useState<Contact[]>([]);
  const [hasAvailableContacts, setHasAvailableContacts] = useState(true);

  useEffect(() => {
    async function fetchGroupData() {
      const fetchedGroup = await groupsRepo.get(groupId);
      const members = await groupMembersRepo.getByGroup(groupId);
      const contactPromises = members.map((member) =>
        contactsRepo.get(member.contactId),
      );
      const contacts = await Promise.all(contactPromises);

      setGroup(fetchedGroup);
      setGroupMembers(contacts.filter((contact) => contact !== null));

      // Check if there are any contacts not in the group
      const allContacts = await contactsRepo.getAll();
      const memberIds = new Set(members.map((m) => m.contactId));
      const availableContacts = allContacts.filter(
        (contact) => !memberIds.has(contact.id),
      );
      setHasAvailableContacts(availableContacts.length > 0);
    }
    fetchGroupData();
  }, [groupId]);

  const onClose = () => {
    router.back();
  };

  const onAddMember = () => {
    router.navigate({
      pathname: "/(group-manager-modal)/add-member",
      params: {
        groupId: groupId,
        existingMemberIds: groupMembers.map((contact) => contact.id).join(","),
      },
    });
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Group Details</Text>
          <BounceButton onPress={onClose}>
            <IconSymbol size={42} name="x.circle" color={"white"} />
          </BounceButton>
        </View>
        <View style={styles.modalContent}>
          {group && group.admin && (
            <Pressable
              style={[
                styles.addMemberButton,
                !hasAvailableContacts && styles.addMemberButtonDisabled,
              ]}
              onPress={onAddMember}
              disabled={!hasAvailableContacts}
            >
              <View style={styles.addMemberContainer}>
                <View
                  style={[
                    styles.addMemberAvatar,
                    !hasAvailableContacts && styles.addMemberAvatarDisabled,
                  ]}
                >
                  <IconSymbol
                    name="person.badge.plus"
                    size={20}
                    color={hasAvailableContacts ? "#0B93F6" : "#555"}
                  />
                </View>
                <View style={styles.addMemberInfo}>
                  <Text
                    style={[
                      styles.addMemberText,
                      !hasAvailableContacts && styles.addMemberTextDisabled,
                    ]}
                  >
                    Add Members
                  </Text>
                </View>
              </View>
            </Pressable>
          )}
          <View style={styles.membersSection}>
            <Text style={styles.sectionTitle}>
              Members ({groupMembers.length})
            </Text>
            <View style={styles.membersContainer}>
              <FlatList
                data={groupMembers}
                keyExtractor={(item) => item.id.toString()}
                scrollEnabled={false}
                ItemSeparatorComponent={() => (
                  <View style={styles.memberSeparator} />
                )}
                renderItem={({ item }) => (
                  <View style={styles.memberItem}>
                    <View style={styles.memberAvatar}>
                      <Text style={styles.memberAvatarText}>
                        {item?.pseudonym?.charAt(0)?.toUpperCase() || "?"}
                      </Text>
                    </View>
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>
                        {item?.pseudonym || "Unknown"}
                      </Text>
                      <Text style={styles.memberKey} numberOfLines={1}>
                        {item?.verificationKey
                          ? item.verificationKey
                              .slice(0, 8)
                              .reduce(
                                (acc, byte) =>
                                  acc + byte.toString(16).padStart(2, "0"),
                                "",
                              ) + "..."
                          : "Unknown"}
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
  modalContainer: {
    flex: 1,
    backgroundColor: "#090909ff",
  },
  addMemberButtonDisabled: {
    opacity: 0.5,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    backgroundColor: "rgba(38, 35, 35, 0.2)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  modalTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
  modalContent: {
    padding: 20,
  },
  addMemberButton: {
    backgroundColor: "rgba(38, 35, 35, 0.3)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    overflow: "hidden",
    marginBottom: 20,
  },
  addMemberContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
  },
  addMemberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(11, 147, 246, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  addMemberAvatarDisabled: {
    backgroundColor: "rgba(85, 85, 85, 0.2)",
  },
  addMemberTextDisabled: {
    color: "#555",
  },
  addMemberInfo: {
    flex: 1,
  },
  addMemberText: {
    color: "#0B93F6",
    fontSize: 16,
    fontWeight: "600",
  },
  membersSection: {
    marginTop: 0,
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
    alignItems: "center",
    justifyContent: "center",
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
