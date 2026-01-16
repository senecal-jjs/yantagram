import { Member } from "../member";

test("serialization of member", async () => {
  const member = await Member.create("bob");
  member.createGroup(2, "anon", 1);
  member.addToGroup("anon");
  const serialized = member.toJSON();
  const deserialized = Member.fromJSON(serialized);

  console.log(member.ecdhPublicKey);
  console.log(deserialized.ecdhPublicKey);

  // expect(member.ecdhPrivateKey).toEqual(deserialized.ecdhPrivateKey);
  // expect(member.ecdhPublicKey).toEqual(deserialized.ecdhPublicKey);
});
