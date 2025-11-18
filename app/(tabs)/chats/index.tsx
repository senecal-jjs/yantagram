import ConversationItem from "@/components/conversation";
import { IconSymbol } from "@/components/ui/icon-symbol";
import useBLE from "@/hooks/use-ble";
import { Conversation } from "@/types/global";
import { Button } from "@react-navigation/elements";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

const mockConversations = [
  {
    id: "1",
    name: "Alice",
    lastMessage: "Hey, how are you?",
    timestamp: "10:30 AM",
  },
  { id: "2", name: "Bob", lastMessage: "Sounds good!", timestamp: "Yesterday" },
  {
    id: "3",
    name: "Charlie",
    lastMessage: "See you there.",
    timestamp: "Tuesday",
  },
];

export default function TabTwoScreen() {
  const router = useRouter();
  const { allDevices, connectedDevices } = useBLE();

  const renderItem = ({ item }: { item: Conversation }) => (
    <ConversationItem
      conversation={item}
      onPress={() =>
        router.navigate({
          pathname: "/chats/[chatId]",
          params: { chatId: item.id },
        })
      }
    />
  );

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.mainContainer}>
        <View style={styles.chatHeader}>
          <View style={{ width: 28 }}></View>
          <Button
            onPressOut={() => {
              console.log(connectedDevices);
            }}
          >
            Con
          </Button>
          <Button
            onPressOut={() => {
              console.log(allDevices);
            }}
          >
            All
          </Button>
          <Text style={styles.headerText}>Chats</Text>
          <IconSymbol
            size={28}
            name="square.and.pencil"
            color={"white"}
          ></IconSymbol>
        </View>
        <FlatList
          data={mockConversations}
          showsVerticalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: "#090909ff",
  },
  chatHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  headerText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
});
