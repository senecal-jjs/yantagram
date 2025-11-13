 
import MessageService from "@/services/message-service";
import * as ExpoDevice from "expo-device";
import {
    setServices,
    startAdvertising
} from 'munim-bluetooth-peripheral';
import { useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import base64 from "react-native-base64";
import {
    BleError,
    BleManager,
    Characteristic,
    Device,
} from "react-native-ble-plx";
import Peripheral, { Characteristic as PeripheralCharacteristic, Service } from 'react-native-peripheral';

export const DATA_SERVICE_UUID = "19b10000-e8f2-537e-4f6c-d104768a1214";
export const COLOR_CHARACTERISTIC_UUID = "19b10001-e8f2-537e-4f6c-d104768a1217";

const bleManager = new BleManager();

function useBLE() {
  const [allDevices, setAllDevices] = useState<Device[]>([]);
  const [connectedDevices, setConnectedDevices] = useState<Device[]>([]);
  const [characteristicValue, setCharacteristic] = useState('')
  const [color, setColor] = useState("white");
  const { receivePacket } = MessageService()

  const requestAndroid31Permissions = async () => {
    const bluetoothScanPermission = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      {
        title: "Location Permission",
        message: "Bluetooth Low Energy requires Location",
        buttonPositive: "OK",
      }
    );
    const bluetoothConnectPermission = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      {
        title: "Location Permission",
        message: "Bluetooth Low Energy requires Location",
        buttonPositive: "OK",
      }
    );
    const fineLocationPermission = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: "Location Permission",
        message: "Bluetooth Low Energy requires Location",
        buttonPositive: "OK",
      }
    );

    return (
      bluetoothScanPermission === "granted" &&
      bluetoothConnectPermission === "granted" &&
      fineLocationPermission === "granted"
    );
  };

  const requestPermissions = async () => {
    if (Platform.OS === "android") {
      if ((ExpoDevice.platformApiLevel ?? -1) < 31) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: "Location Permission",
            message: "Bluetooth Low Energy requires Location",
            buttonPositive: "OK",
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        const isAndroid31PermissionsGranted =
          await requestAndroid31Permissions();

        return isAndroid31PermissionsGranted;
      }
    } else {
      return true;
    }
  }; 

  const updateCharacteristic = (value: string) => {
    setCharacteristic(value)
  }

  const setupPeripheral = () => {
    setServices([
        {
            uuid: DATA_SERVICE_UUID,
            characteristics: [
                {
                    uuid: COLOR_CHARACTERISTIC_UUID,
                    properties: ['read', 'write', 'notify', 'writeWithoutResponse'],
                    value: characteristicValue,
                }
            ]
        }
    ])

    startAdvertising({
        serviceUUIDs: [DATA_SERVICE_UUID],
        localName: "bitcli",
    })
  }

  const advertiseAsPeripheral = async () => {
    Peripheral.onStateChanged(state => {
        // wait until bluetooth is ready
        if (state === 'poweredOn') {
            console.log("ble peripheral powered on")

            // define a characteristic with a value
            const ch = new PeripheralCharacteristic({
                uuid: COLOR_CHARACTERISTIC_UUID,
                properties: ['read', 'write', 'notify', 'writeWithoutResponse'],
                permissions: ['readable', 'writeable'],
                onReadRequest: async (offset?: number) => {
                    return characteristicValue
                },
                onWriteRequest: async (value: string, offset?: number) => {
                    // store or do something with value
                    receivePacket(value)
                }
            })

            // add the characteristic to the service
            const service = new Service({
                uuid: DATA_SERVICE_UUID,
                characteristics: [ch]
            })

            Peripheral.addService(service).then(() => {
                // start advertising to make your device discoverable
                Peripheral.startAdvertising({
                    name: 'bitcli',
                    serviceUuids: [DATA_SERVICE_UUID]
                })
            })
        }
    })
  }

  const connectToDevice = async (device: Device) => {
    try {
      const deviceConnection = await bleManager.connectToDevice(device.id);
      setConnectedDevices([...connectedDevices, deviceConnection])
      await deviceConnection.discoverAllServicesAndCharacteristics();
      bleManager.stopDeviceScan();

      startStreamingData(deviceConnection);
    } catch (e) {
      console.log("FAILED TO CONNECT", e);
    }
  };

  const isDuplicateDevice = (devices: Device[], nextDevice: Device) =>
    devices.findIndex((device) => nextDevice.id === device.id) > -1;

  const scanForPeripherals = () =>
    bleManager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.log(error);
      }

      // confirm the device is advertising the data service uuid
      if (device && device.serviceUUIDs?.includes(DATA_SERVICE_UUID)) {
        setAllDevices((prevState: Device[]) => {
          if (!isDuplicateDevice(prevState, device)) {
            console.log(`detected peripheral ${device.id}`)
            connectToDevice(device)
            return [...prevState, device];
          }
          return prevState;
        });
      }
    });

  const onDataUpdate = (
    error: BleError | null,
    characteristic: Characteristic | null
  ) => {
    if (error) {
      console.log(error);
      return;
    } else if (!characteristic?.value) {
      console.log("No Data was received");
      return;
    }

    const colorCode = base64.decode(characteristic.value);

    let color = "white";
    if (colorCode === "B") {
      color = "blue";
    } else if (colorCode === "R") {
      color = "red";
    } else if (colorCode === "G") {
      color = "green";
    }

    setColor(color);
  };

  const startStreamingData = async (device: Device) => {
    if (device) {
      device.monitorCharacteristicForService(
        DATA_SERVICE_UUID,
        COLOR_CHARACTERISTIC_UUID,
        onDataUpdate
      );
    } else {
      console.log("No Device Connected");
    }
  };

  return {
    connectToDevice,
    allDevices,
    connectedDevices,
    color,
    requestPermissions,
    scanForPeripherals,
    startStreamingData,
    advertiseAsPeripheral,
    updateCharacteristic,
  };
}

export default useBLE;