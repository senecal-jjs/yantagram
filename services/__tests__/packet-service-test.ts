import { BitchatPacket, Message } from "@/types/global";
import {
  fromBinaryPayload,
  toBinaryPayload,
} from "../message-protocol-service";
import { decode, encode } from "../packet-protocol-service";

test("encode & decode packet", () => {
  const message: Message = {
    id: "1",
    sender: "2",
    groupId: "5",
    contents: "Hello!",
    timestamp: Date.now(),
  };

  const encoded = toBinaryPayload(message)!;

  const packet: BitchatPacket = {
    version: 1,
    type: 1,
    timestamp: Date.now(),
    payload: encoded,
    allowedHops: 3,
  };

  const encodedPacket = encode(packet)!;
  const decodedPacket = decode(encodedPacket);
  const decodedMessage = fromBinaryPayload(decodedPacket!.payload);

  expect(decodedMessage).toEqual(message);
});
