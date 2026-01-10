import { Stack } from "expo-router";

export default function ModalLayout() {
  return (
    <Stack
      screenOptions={{
        presentation: "modal", // Key option to make it a modal
      }}
    >
      <Stack.Screen
        name="start-group"
        options={{
          headerShown: false,
        }}
      ></Stack.Screen>
      <Stack.Screen
        name="select-group"
        options={{
          headerShown: false,
          presentation: "card",
          animation: "slide_from_right",
        }}
      ></Stack.Screen>
      <Stack.Screen
        name="name-group"
        options={{
          headerShown: false,
          presentation: "card",
          animation: "slide_from_right",
        }}
      ></Stack.Screen>
    </Stack>
  );
}
