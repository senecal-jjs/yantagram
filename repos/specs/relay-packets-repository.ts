import { BitchatPacket } from "@/types/global";

export type RelayPacket = {
  packet: BitchatPacket;
  deviceUUID: string;
};

export default interface RelayPacketsRepository {
  create(packet: BitchatPacket, deviceUUID: string): Promise<BitchatPacket>;
  getAll(): Promise<RelayPacket[]>;
  delete(id: number): Promise<void>;
  getEarliest(): Promise<RelayPacket | null>;
}
