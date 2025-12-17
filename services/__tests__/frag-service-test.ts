import { FragmentType, Message } from "@/types/global";
import { Base64String } from "@/utils/Base64String";
import { getRandomBytes } from "expo-crypto";
import {
  extractFragmentMetadata,
  fragmentPayload,
  reassembleFragments,
} from "../frag-service";
import {
  fromBinaryPayload,
  toBinaryPayload,
} from "../message-protocol-service";

test("fragment & re-assemble", () => {
  const message: Message = {
    id: "1",
    sender: "2",
    groupId: "3",
    contents: Base64String.fromBytes(getRandomBytes(1000)).getValue(),
    timestamp: Date.now(),
  };

  const { fragments } = fragmentPayload(
    toBinaryPayload(message)!,
    FragmentType.MESSAGE,
  );

  const meta = extractFragmentMetadata(fragments[0]);

  expect(meta?.fragmentId).not.toBeNull();
  expect(meta?.index).toBe(0);

  const reassembledMessage = reassembleFragments(fragments)!;
  const decodedMessage = fromBinaryPayload(reassembledMessage.data);

  console.log(decodedMessage);

  expect(decodedMessage.contents).toEqual(message.contents);
});
