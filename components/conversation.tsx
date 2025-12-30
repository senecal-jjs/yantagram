import { Conversation } from "@/app/(tabs)/chats";
import { Pressable, StyleSheet, Text, View } from "react-native";

const ConversationItem = ({
  conversation,
  onPress,
}: {
  conversation: Conversation;
  onPress: any;
}) => {
  return (
    <Pressable
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
      onPress={onPress}
    >
      {({ pressed }) => (
        <>
          {conversation.hasUnread && <View style={styles.unreadDot} />}
          {!conversation.hasUnread && (
            <View style={[pressed ? styles.readDotPressed : styles.readDot]} />
          )}
          <View style={styles.content}>
            <Text style={styles.name}>{conversation.name}</Text>
            <Text style={styles.lastMessage} numberOfLines={1}>
              {conversation.lastMessage}
            </Text>
          </View>
          <Text style={styles.timestamp}>{conversation.timestamp}</Text>
        </>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  item: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
  },
  itemPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  content: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: "bold",
    color: "white",
  },
  lastMessage: {
    fontSize: 14,
    color: "#888",
  },
  timestamp: {
    fontSize: 12,
    color: "#aaa",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#007AFF",
    marginRight: 12,
  },
  readDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
    opacity: 0,
  },
  readDotPressed: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
    opacity: 0,
  },
});

export default ConversationItem;
