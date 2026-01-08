import { BitchatPacket } from "@/types/global";

export type RelayPacket = {
  id: number;
  packet: BitchatPacket;
  deviceUUID: string;
  relayed: boolean;
};

export default interface RelayPacketsRepository {
  create(packet: BitchatPacket, deviceUUID: string): Promise<BitchatPacket>;
  getAll(): Promise<RelayPacket[]>;
  delete(id: number): Promise<void>;
  deleteAll(): Promise<void>;
  getEarliest(): Promise<RelayPacket | null>;
  updateAllowedHops(id: number, hops: number): Promise<void>;
  count(): Promise<number>;
  deleteOldest(n: number): Promise<number>;
  markRelayed(id: number): Promise<void>;
  getEarliestUnrelayed(): Promise<RelayPacket | null>;
}
