import { DeliveryStatus, Message } from "@/types/global";
import { Base64String } from "@/utils/Base64String";
import { getRandomBytes } from "expo-crypto";
import {
  extractFragmentMetadata,
  fragmentMessage,
  reassembleFragments,
} from "../frag-service";

test("fragment & re-assemble", () => {
  const message: Message = {
    id: "1",
    sender: "2",
    contents: Base64String.fromBytes(getRandomBytes(1000)).getValue(),
    timestamp: Date.now(),
    isRelay: false,
    originalSender: null,
    isPrivate: true,
    recipientNickname: "@ace",
    senderPeerId: "p2",
    deliveryStatus: DeliveryStatus.SENDING,
  };

  const { fragments } = fragmentMessage(message, "from", "to");

  const meta = extractFragmentMetadata(fragments[0]);

  console.log(meta?.fragmentId);

  expect(meta?.fragmentId).not.toBeNull();
  expect(meta?.index).toBe(0);

  const reassembledMessage = reassembleFragments(fragments)!;

  expect(reassembledMessage.contents).toEqual(message.contents);
});
