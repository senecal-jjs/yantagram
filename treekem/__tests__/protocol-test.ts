import { Member } from "../member";
import {
  deserializeWelcomeMessage,
  serializeWelcomeMessage,
} from "../protocol";

test("serialize/deserialize welcome message for transit over wire", async () => {
  const member = await Member.create("bob");
  member.createGroup(2, "anon", 1);
  member.addToGroup("anon");
  const member2 = await Member.create("alice");
  const welcome = await member.sendWelcomeMessage(
    member2.credential,
    "anon",
    "test",
  );

  const serializedWelcome = serializeWelcomeMessage(welcome);
  const deserializedWelcome = deserializeWelcomeMessage(serializedWelcome);

  expect(welcome.key).toEqual(deserializedWelcome.key);
  expect(welcome.updateMessage.ciphertext).toEqual(
    deserializedWelcome.updateMessage.ciphertext,
  );
  expect(welcome.updateMessage.nonce).toEqual(
    deserializedWelcome.updateMessage.nonce,
  );
});
