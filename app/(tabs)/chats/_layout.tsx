import { Stack } from "expo-router";

export const unstable_settings = {
  initialRouteName: "index",
};

export default function ChatsLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
          title: "",
        }}
      />
      <Stack.Screen
        name="[chatId]"
        options={{
          headerShown: false,
        }}
      ></Stack.Screen>
    </Stack>
  );
}
