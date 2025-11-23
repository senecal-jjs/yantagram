import { Tabs } from "expo-router";
import React from "react";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function TabLayout() {
  const colorScheme = useColorScheme();

  // const { scan, advertise, permissions } = useBluetooth();

  // const advertiseNow = async () => {
  //   const isPermissionsEnabled = await permissions();
  //   if (isPermissionsEnabled) {
  //     advertise();
  //   }
  // };

  // const scanForDevices = async () => {
  //   const isPermissionsEnabled = await permissions();
  //   if (isPermissionsEnabled) {
  //     scan();
  //   }
  // };

  // advertiseNow();
  // scanForDevices();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Rooms",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="house.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: "Chats",
          tabBarLabel: "Chats",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="message" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
