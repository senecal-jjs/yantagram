import { RecipientWithPseudonym } from "@/repos/specs/message-delivery-repository";
import React from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

interface DeliveryDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  recipients: RecipientWithPseudonym[];
}

export const DeliveryDetailsModal = ({
  visible,
  onClose,
  recipients,
}: DeliveryDetailsModalProps) => {
  const formatTime = (timestamp: number | null): string => {
    if (!timestamp) return "Pending";
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const renderRecipient = ({ item }: { item: RecipientWithPseudonym }) => (
    <View style={styles.recipientRow}>
      <View style={styles.recipientInfo}>
        <Text style={styles.pseudonym}>{item.pseudonym}</Text>
      </View>
      <View style={styles.statusContainer}>
        {item.deliveredAt ? (
          <View style={styles.deliveredBadge}>
            <Text style={styles.deliveredText}>✓ Delivered</Text>
            <Text style={styles.timeText}>{formatTime(item.deliveredAt)}</Text>
          </View>
        ) : (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingText}>Pending</Text>
          </View>
        )}
      </View>
    </View>
  );

  const deliveredCount = recipients.filter(
    (r) => r.deliveredAt !== null,
  ).length;
  const totalCount = recipients.length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Delivery Status</Text>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>Done</Text>
          </Pressable>
        </View>

        <View style={styles.summaryContainer}>
          <Text style={styles.summaryText}>
            {deliveredCount} of {totalCount} recipients received this message
          </Text>
        </View>

        <FlatList
          data={recipients}
          keyExtractor={(item) => item.verificationKey}
          renderItem={renderRecipient}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1c1c1eff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#3a3a3cff",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "white",
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    color: "#0A84FF",
    fontSize: 16,
    fontWeight: "500",
  },
  summaryContainer: {
    padding: 16,
    backgroundColor: "#2c2c2eff",
    marginBottom: 8,
  },
  summaryText: {
    color: "#8e8e93ff",
    fontSize: 14,
    textAlign: "center",
  },
  listContent: {
    padding: 16,
  },
  recipientRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  recipientInfo: {
    flex: 1,
  },
  pseudonym: {
    color: "white",
    fontSize: 16,
    fontWeight: "500",
  },
  statusContainer: {
    alignItems: "flex-end",
  },
  deliveredBadge: {
    alignItems: "flex-end",
  },
  deliveredText: {
    color: "#30d158ff",
    fontSize: 14,
    fontWeight: "500",
  },
  timeText: {
    color: "#8e8e93ff",
    fontSize: 12,
    marginTop: 2,
  },
  pendingBadge: {
    backgroundColor: "#3a3a3cff",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pendingText: {
    color: "#8e8e93ff",
    fontSize: 14,
  },
  separator: {
    height: 1,
    backgroundColor: "#3a3a3cff",
  },
});
