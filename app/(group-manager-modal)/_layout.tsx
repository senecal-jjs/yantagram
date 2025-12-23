import { Stack } from "expo-router";

export default function AddToGroupLayout() {
  return (
    <Stack
      screenOptions={{
        presentation: "modal",
      }}
    >
      <Stack.Screen
        name="group-details"
        options={{
          headerShown: false,
        }}
      ></Stack.Screen>
      <Stack.Screen
        name="add-member"
        options={{
          headerShown: false,
          presentation: "card",
          animation: "slide_from_right",
        }}
      ></Stack.Screen>
    </Stack>
  );
}
