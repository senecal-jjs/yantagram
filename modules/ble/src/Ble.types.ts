export type BleModuleEvents = {
  onPeripheralReceivedWrite: (rawBytes: MessageEvent) => void;
  onCentralReceivedNotification: (rawBytes: MessageEvent) => void;
  onPeripheralConnection: (connection: Connection) => void;
  onPeripheralDisconnect: (connection: Connection) => void;
  onCentralSubscription: (connection: Connection) => void;
  onCentralUnsubscription: (connection: Connection) => void;
  onReadRSSI: (connection: Connection) => void;
};

export type Connection = {
  deviceUUID: string;
  rssi?: number;
};

export type MessageEvent = {
  rawBytes: Uint8Array;
  deviceUUID: string;
};
