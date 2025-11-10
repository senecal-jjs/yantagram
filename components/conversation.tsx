import { Pressable, StyleSheet, Text, View } from "react-native";

const ConversationItem = ({ conversation, onPress }: { conversation: Conversation, onPress: any }) => {
    return (
        <Pressable style={styles.item} onPress={onPress}>
            <View style={styles.content}>
                <Text style={styles.name}>{conversation.name}</Text>
                <Text style={styles.lastMessage} numberOfLines={1}>{conversation.lastMessage}</Text>
            </View>
            <Text style={styles.timestamp}>{conversation.timestamp}</Text>
        </Pressable>
    )
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
  },
  content: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
  lastMessage: {
    fontSize: 14,
    color: '#888',
  },
  timestamp: {
    fontSize: 12,
    color: '#aaa',
  },
});

export default ConversationItem