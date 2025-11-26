import { DeliveryStatus, Message } from "@/types/global";
import {
  fromBinaryPayload,
  toBinaryPayload,
} from "../message-protocol-service";

test("protocol encodes & decodes", () => {
  const message: Message = {
    id: "1",
    sender: "2",
    contents: "Hello!",
    timestamp: Date.now(),
    isRelay: false,
    originalSender: null,
    isPrivate: true,
    recipientNickname: "@ace",
    senderPeerId: "p2",
    deliveryStatus: DeliveryStatus.SENDING,
  };

  const encoded = toBinaryPayload(message)!;
  const decoded = fromBinaryPayload(encoded);

  expect(decoded).toEqual(message);
});
