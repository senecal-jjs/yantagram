import { Message } from "@/types/global";
import {
  fromBinaryPayload,
  toBinaryPayload,
} from "../message-protocol-service";

test("protocol encodes & decodes", () => {
  const message: Message = {
    id: "1",
    sender: "2",
    groupId: "5",
    contents: "Hello!",
    timestamp: Date.now(),
  };

  const encoded = toBinaryPayload(message)!;
  const decoded = fromBinaryPayload(encoded);

  expect(decoded).toEqual(message);
});
