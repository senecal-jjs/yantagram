import { Stack } from "expo-router";

export default function ModalLayout() {
  return (
    <Stack
      screenOptions={{
        presentation: "modal", // Key option to make it a modal
      }}
    >
      <Stack.Screen
        name="start-settings"
        options={{
          headerShown: false,
        }}
      ></Stack.Screen>
      <Stack.Screen
        name="my-info"
        options={{
          headerShown: false,
          presentation: "card",
          animation: "slide_from_right",
        }}
      ></Stack.Screen>
      <Stack.Screen
        name="security-privacy"
        options={{
          headerShown: false,
          presentation: "card",
          animation: "slide_from_right",
        }}
      ></Stack.Screen>
    </Stack>
  );
}
