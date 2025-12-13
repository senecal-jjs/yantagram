import { Member } from "../member";

test("serialization of member", async () => {
  const member = await Member.create("bob");
  member.createGroup(2, "anon", 1);
  member.addToGroup("anon");
  const serialized = member.toJSON();
  console.log("JSON MEMBER");
  console.log(serialized);
  console.log(serialized.groups[0]);
  // const deserialized = Member.deserialize(serialized);

  // console.log(member.ecdhPrivateKey);
  // console.log(deserialized.ecdhPublicKey);

  // expect(member.ecdhPrivateKey).toEqual(deserialized.ecdhPrivateKey);
  // expect(member.ecdhPublicKey).toEqual(deserialized.ecdhPublicKey);
});
