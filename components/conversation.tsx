import { Conversation } from "@/app/(tabs)/chats";
import { useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import ReanimatedSwipeable, {
  SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import Reanimated, {
  SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";

const ConversationItem = ({
  conversation,
  onPress,
  onDelete,
}: {
  conversation: Conversation;
  onPress: () => void;
  onDelete?: (id: string) => void;
}) => {
  const swipeableRef = useRef<SwipeableMethods>(null);

  const RightAction = ({
    drag,
    progress,
  }: {
    drag: SharedValue<number>;
    progress: SharedValue<number>;
  }) => {
    const animatedStyle = useAnimatedStyle(() => ({
      opacity: progress.value,
      transform: [{ translateX: drag.value + 80 }],
    }));

    return (
      <Reanimated.View style={[styles.deleteAction, animatedStyle]}>
        <Pressable
          style={styles.deleteButton}
          onPress={() => {
            swipeableRef.current?.close();
            onDelete?.(conversation.id);
          }}
        >
          <Text style={styles.deleteText}>Delete</Text>
        </Pressable>
      </Reanimated.View>
    );
  };

  const renderRightActions = (
    progress: SharedValue<number>,
    drag: SharedValue<number>,
  ) => {
    return <RightAction drag={drag} progress={progress} />;
  };

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      overshootRight={false}
      friction={2}
    >
      <Pressable
        style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
        onPress={onPress}
      >
        {({ pressed }) => (
          <>
            {conversation.hasUnread && <View style={styles.unreadDot} />}
            {!conversation.hasUnread && (
              <View
                style={[pressed ? styles.readDotPressed : styles.readDot]}
              />
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
    </ReanimatedSwipeable>
  );
};

const styles = StyleSheet.create({
  item: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    // backgroundColor: "#000",
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
  deleteAction: {
    justifyContent: "center",
    alignItems: "flex-end",
    backgroundColor: "#FF3B30",
    width: 80,
  },
  deleteButton: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: 80,
  },
  deleteText: {
    color: "white",
    fontWeight: "600",
    fontSize: 14,
  },
});

export default ConversationItem;
