export type BleModuleEvents = {
  onPeripheralReceivedWrite: (rawBytes: Uint8Array) => void;
  onCentralReceivedNotification: (rawBytes: Uint8Array) => void;
};
