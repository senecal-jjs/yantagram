export type BleModuleEvents = {
  onPeripheralReceivedWrite: (rawBytes: MessageEvent) => void;
  onCentralReceivedNotification: (rawBytes: MessageEvent) => void;
};

export type MessageEvent = {
  rawBytes: Uint8Array;
};
