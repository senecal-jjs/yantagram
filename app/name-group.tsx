import { IconSymbol } from "@/components/ui/icon-symbol";
import { useGroupCreation } from "@/contexts/group-creation-context";
import { Member } from "@/treekem/member";
import { secureFetch } from "@/utils/secure-store";
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
import {
  CREDENTIALS_KEY
} from "./_layout";

export default function NameGroupScreen() {
  const router = useRouter();
  const { groupName, setGroupName, selectedMembers, reset } =
    useGroupCreation();

  const handleClose = () => {
    router.back();
  };

  const handleCreate = async () => {
    const credentials = await secureFetch(CREDENTIALS_KEY);

    if (!groupName.trim() || selectedMembers.length === 0 || !credentials) {
      console.error("Missing required data for group creation");
      return;
    }

    try {
      // Load signing material and ECDH keypair from secure store
      const signingData = await secureFetch("treekem_signing_material");
      const { privateKey: signingKeyBase64 } = JSON.parse(signingData);
      const signingKey = Buffer.from(signingKeyBase64, "base64");

      const ecdhData = await secureFetch("treekem_ecdh_keypair");
      const { privateKey: ecdhPrivateKeyBase64 } = JSON.parse(ecdhData);
      const ecdhPrivateKey = Buffer.from(ecdhPrivateKeyBase64, "base64");

      // Create member instance for current user
      const creator = new Member(
        credentials.pseudonym,
        credentials.ecdhPublicKey,
        ecdhPrivateKey,
        credentials,
        signingKey,
      );

      // Group capacity = creator + selected members
      const groupCapacity = selectedMembers.length + 1;

      // Create the group with TreeKEM
      creator.createGroup(groupCapacity, groupName, 1);

      // Add creator to the group
      await creator.addToGroup(groupName);

      // TODO: Store group state in database
      // TODO: Generate and send welcome messages to selected members
      // TODO: Each welcome message should contain:
      //   - Group configuration (name, threshold, capacity)
      //   - Ratchet tree state
      //   - Path secrets for the recipient
      //   - Creator's credential

      console.log(
        "Group created:",
        groupName,
        "with capacity:",
        groupCapacity,
        "members:",
        selectedMembers.map((m) => m.pseudonym),
      );

      reset(); // Clear the context after creation
      router.navigate("/chats");
    } catch (error) {
      console.error("Failed to create group:", error);
      // TODO: Show error alert to user
    }
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
