import { BitchatPacket } from "@/types/global";
import { Base64String } from "@/utils/Base64String";

export default interface FragmentsRepository {
  create(
    fragmentId: Base64String,
    position: number,
    packet: BitchatPacket,
  ): Promise<BitchatPacket>;

  getByFragmentId(fragmentId: Base64String): Promise<BitchatPacket[]>;

  getFragmentCount(fragmentId: Base64String): Promise<number>;

  deleteByFragmentId(fragmentId: Base64String): Promise<void>;

  exists(fragmentId: Base64String, position: number): Promise<boolean>;
}
