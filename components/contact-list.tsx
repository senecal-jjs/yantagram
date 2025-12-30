import {
  ContactsRepositoryToken,
  useRepos,
} from "@/contexts/repository-context";
import ContactsRepository, { Contact } from "@/repos/specs/contacts-repository";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

interface ContactListProps {
  onContactPress?: (contact: Contact) => void;
  selectable?: boolean;
  onContactSelect?: (contact: Contact) => void;
  onContactDeselect?: (contact: Contact) => void;
  selectedContactIds?: number[];
  contactsToRemove?: number[];
}

export default function ContactList({
  onContactPress,
  selectable = false,
  onContactSelect,
  onContactDeselect,
  selectedContactIds,
  contactsToRemove,
}: ContactListProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { getRepo } = useRepos();
  const contactsRepo = getRepo<ContactsRepository>(ContactsRepositoryToken);

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      setIsLoading(true);
      const allContacts = await contactsRepo.getAll();
      setContacts(
        allContacts.filter(
          (contact) => !(contactsToRemove?.includes(contact.id) ?? false),
        ),
      );
    } catch (error) {
      console.error("Failed to load contacts:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const renderContact = ({ item }: { item: Contact }) => {
    const isSelected =
      selectable && (selectedContactIds?.includes(item.id) ?? false);
    const handlePress = () => {
      if (selectable) {
        if (isSelected) {
          onContactDeselect?.(item);
        } else {
          onContactSelect?.(item);
        }
      } else {
        onContactPress?.(item);
      }
    };

    return (
      <Pressable
        style={({ pressed }) => [
          styles.contactItem,
          pressed && styles.contactItemPressed,
          isSelected && styles.contactItemSelected,
        ]}
        onPress={handlePress}
      >
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {item.pseudonym.charAt(0).toUpperCase()}
            </Text>
          </View>
        </View>
        <View style={styles.contactInfo}>
          <Text style={styles.pseudonym}>{item.pseudonym}</Text>
          <Text style={styles.verificationKey} numberOfLines={1}>
            Verification Key:
            {item.verificationKey
              .slice(0, 4)
              .reduce(
                (acc, byte) => acc + byte.toString(16).padStart(2, "0"),
                "",
              )}
            ...
          </Text>
        </View>
        {selectable ? (
          <View style={styles.radioContainer}>
            <View
              style={[
                styles.radioOuter,
                isSelected && styles.radioOuterSelected,
              ]}
            >
              {isSelected && <View style={styles.radioInner} />}
            </View>
          </View>
        ) : (
          <View style={styles.timestampContainer}>
            <Text style={styles.timestamp}>
              {new Date(item.createdAt).toLocaleDateString()}
            </Text>
          </View>
        )}
      </Pressable>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>No contacts yet</Text>
      <Text style={styles.emptySubtext}>
        Scan a QR code to add your first contact
      </Text>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <FlatList
      data={contacts}
      renderItem={renderContact}
      keyExtractor={(item) => item.id.toString()}
      ListEmptyComponent={renderEmpty}
      contentContainerStyle={
        contacts.length === 0 ? styles.emptyListContainer : undefined
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    backgroundColor: "rgba(38, 35, 35, 0.2)",
    marginBottom: 1,
    borderRadius: 20,
    marginLeft: 10,
    marginRight: 10,
  },
  contactItemPressed: {
    backgroundColor: "rgba(38, 35, 35, 0.4)",
  },
  contactItemSelected: {
    backgroundColor: "rgba(38, 35, 35, 0.6)",
    borderColor: "#666",
    borderWidth: 1,
  },
  avatarContainer: {
    marginRight: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#333",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },
  contactInfo: {
    flex: 1,
  },
  pseudonym: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 4,
  },
  verificationKey: {
    fontSize: 12,
    color: "#888",
    fontFamily: "monospace",
  },
  timestampContainer: {
    marginLeft: 8,
  },
  timestamp: {
    fontSize: 11,
    color: "#666",
  },
  radioContainer: {
    marginLeft: 8,
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#666",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  radioOuterSelected: {
    borderColor: "#fff",
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#fff",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#090909ff",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    color: "#666",
    fontWeight: "600",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#444",
  },
  emptyListContainer: {
    flexGrow: 1,
    justifyContent: "center",
  },
});
