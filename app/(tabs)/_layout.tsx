import { Tabs } from "expo-router";
import React from "react";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import {
  ConnectedDevicesRepositoryToken,
  useRepos,
} from "@/contexts/repository-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { usePacketService } from "@/hooks/use-packet-service";
import BleModule from "@/modules/ble";
import ConnectedDevicesRepository from "@/repos/specs/connected-devices-repository";
import { useEventListener } from "expo";

export default function TabLayout() {
  const colorScheme = useColorScheme();

  const { handleIncomingPacket } = usePacketService();
  const { getRepo } = useRepos();
  const connectedDevicesRepo = getRepo<ConnectedDevicesRepository>(
    ConnectedDevicesRepositoryToken,
  );

  useEventListener(BleModule, "onPeripheralReceivedWrite", (message) => {
    console.log("onPeripheralReceivedWrite: ", message.deviceUUID);
    handleIncomingPacket(message.rawBytes, message.deviceUUID);
  });

  useEventListener(BleModule, "onCentralReceivedNotification", (message) => {
    console.log("onCentralReceivedNotification: ", message.deviceUUID);
    handleIncomingPacket(message.rawBytes, message.deviceUUID);
  });

  useEventListener(BleModule, "onPeripheralConnection", (connection) => {
    console.log(
      "onPeripheralConnection: ",
      connection.deviceUUID,
      connection.rssi,
    );
    connectedDevicesRepo.upsert(
      connection.deviceUUID,
      connection.rssi ?? null,
      true,
    );
  });

  useEventListener(BleModule, "onPeripheralDisconnect", (connection) => {
    console.log("onPeripheralDisconnect: ", connection.deviceUUID);
    connectedDevicesRepo.updateConnectionStatus(connection.deviceUUID, false);
  });

  useEventListener(BleModule, "onReadRSSI", (connection) => {
    console.log("onReadRSSI: ", connection.deviceUUID, connection.rssi);
    if (connection.rssi) {
      connectedDevicesRepo.updateRSSI(connection.deviceUUID, connection.rssi);
    }
  });

  useEventListener(BleModule, "onCentralSubscription", (connection) => {
    console.log("onCentralSubscription: ", connection.deviceUUID);
    connectedDevicesRepo.upsert(
      connection.deviceUUID,
      connection.rssi ?? null,
      true,
    );
  });

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
