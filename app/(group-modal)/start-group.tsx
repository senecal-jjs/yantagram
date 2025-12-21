import ContactList from "@/components/contact-list";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useCredentials } from "@/contexts/credential-context";
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
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Wave } from "react-native-animated-spinkit";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

export default function StartMessageScreen() {
  const router = useRouter();
  const { member, saveMember } = useCredentials();
  const [isProcessingGroup, setIsProcessingGroup] = useState(false);
  const { sendAmigoWelcome } = useMessageSender();
  const { getRepo } = useRepos();
  const groupsRepo = getRepo<GroupsRepository>(GroupsRepositoryToken);
  const groupMembersRepo = getRepo<GroupMembersRepository>(
    GroupMembersRepositoryToken,
  );

  const handleClose = () => {
    router.back();
  };

  const handleContactPress = async (contact: Contact) => {
    if (!member) {
      console.error("Missing member state");
      return;
    }

    try {
      setIsProcessingGroup(true);

      // group capacity (member plus contact)
      const groupCapacity = 2;

      // group members will share this ID via the welcome message
      // members of the group can give the group whatever name they want on their own device
      const groupId = randomUUID();

      // Create the group with TreeKEM
      member.createGroup(groupCapacity, groupId, 1);

      // add creator to the group
      await member.addToGroup(groupId);

      // Save update member state with new group
      await saveMember();

      const group = await groupsRepo.create(groupId, contact.pseudonym);

      sendWelcomeMessage(contact, member, group.id);

      console.log("Group created");

      // Dismiss modals and navigate to chats tab, then to the new chat
      router.dismissTo({
        pathname: "/chats/[chatId]",
        params: { chatId: group.id },
      });
    } catch (error) {
      console.error("Failed to create group:", error);
      setIsProcessingGroup(false);
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

  const handleNewGroupPress = () => {
    router.navigate({
      pathname: "/select-group",
    });
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.modalContent}>
        {!isProcessingGroup && (
          <View>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Message</Text>
              <Pressable onPress={handleClose}>
                <IconSymbol size={32} name="x.circle" color={"white"} />
              </Pressable>
            </View>

            <View style={styles.buttonContainer}>
              <Pressable style={styles.button} onPress={handleNewGroupPress}>
                <IconSymbol
                  size={38}
                  name="person.2"
                  color={"white"}
                ></IconSymbol>
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
          </View>
        )}
        {isProcessingGroup && (
          <View style={styles.spinnerOverlay}>
            <Wave size={48} color="#FFF"></Wave>
          </View>
        )}
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
  spinnerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
});
