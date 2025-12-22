import { BitchatPacket } from "@/types/global";

export default interface IncomingPacketsRepository {
  create(packet: BitchatPacket): Promise<BitchatPacket>;
  getAll(): Promise<BitchatPacket[]>;
  delete(id: number): Promise<void>;
  getEarliest(): Promise<BitchatPacket | null>;
  exists(payloadHash: number): Promise<boolean>;
}
