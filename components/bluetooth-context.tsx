// BluetoothContext.js
import useBLE from "@/hooks/use-ble";
import React, { createContext, useContext } from "react";
import { Device } from "react-native-ble-plx";

interface BluetoothContextType {
  connectedDevices: Device[];
  allDevices: Device[];
  scan: () => Promise<void>;
  advertise: () => Promise<void>;
  permissions: () => Promise<boolean>;
}

const BluetoothContext = createContext<BluetoothContextType | undefined>(
  undefined,
);

export const BluetoothProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const {
    allDevices,
    connectedDevices,
    scanForPeripherals,
    advertiseAsPeripheral,
    requestPermissions,
    setupPeripheral,
  } = useBLE();

  const scan = async () => {
    scanForPeripherals();
  };

  const advertise = async () => {
    advertiseAsPeripheral();
    // setupPeripheral();
  };

  const permissions = async (): Promise<boolean> => {
    return requestPermissions();
  };

  const value = {
    allDevices,
    connectedDevices,
    scan,
    advertise,
    permissions,
  };

  return (
    <BluetoothContext.Provider value={value}>
      {children}
    </BluetoothContext.Provider>
  );
};

export const useBluetooth = () => {
  const context = useContext(BluetoothContext);

  if (context === undefined) {
    throw new Error("useBluetooth must be used within a BluetoothProvider");
  }

  return context;
};
