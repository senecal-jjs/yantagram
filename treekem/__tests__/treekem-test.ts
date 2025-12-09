import { Member } from "../member";
import { Credentials } from "../types";
import { RSAKeyPair, SignatureMaterial, SymmetricKey } from "../upke";

describe("TreeKEM Member Tests", () => {
  test("test_new_member", async () => {
    // We want to test the attributes of a member are valid. Key material and pseudonym
    const member = await Member.create("bob");

    // Testing valid pseudonym
    expect(member.pseudonym).toBe("bob");

    // Testing valid RSA key material
    const testMessage = new TextEncoder().encode(
      "Created a new member. Lets see!",
    );

    const rsaKeyPair = new RSAKeyPair(
      member.rsaPublicKey,
      member.rsaPrivateKey,
    );

    const encrypted = await rsaKeyPair.encrypt(testMessage);
    const decryptedMessage = await rsaKeyPair.decrypt(encrypted);

    expect(decryptedMessage).toEqual(testMessage);

    // Testing valid signature material
    const signingMaterial = new SignatureMaterial(
      member.credential.verificationKey,
      member.signingKey,
    );

    const signature = signingMaterial.sign(testMessage);

    expect(
      SignatureMaterial.verify(
        testMessage,
        signature,
        member.credential.verificationKey,
      ),
    ).toBe(true);

    // Groups map should be empty. Hasn't been initialized yet because a group hasn't been created
    expect(member.groups.size).toBe(0);
  });

  test("test_credentials", async () => {
    // We want to test if a cred can be used to verify the identity of someone
    const rsaMaterial = await RSAKeyPair.generate();
    const signingMaterial = SignatureMaterial.generate();
    const creds: Credentials = {
      verificationKey: signingMaterial.publicKey,
      pseudonym: "alice",
      signature: signingMaterial.sign(signingMaterial.publicKey),
      rsaPublicKey: rsaMaterial.rsaPublicKey,
    };

    expect(
      SignatureMaterial.verify(
        creds.verificationKey,
        creds.signature,
        creds.verificationKey,
      ),
    ).toBe(true);
  });

  test("test_member_credentials", async () => {
    // Credentials should be taken from the state of the member
    const member = await Member.create("Alice");

    // Test the validity of the credentials
    expect(
      SignatureMaterial.verify(
        member.credential.verificationKey,
        member.credential.signature,
        member.credential.verificationKey,
      ),
    ).toBe(true);
  });

  test("test_create_group", async () => {
    // Test to see if the group is initialized in the members stored state
    const member = await Member.create("Bob");
    member.createGroup(2, "anonymous", 1);
    expect(member.groups.size).toBe(1);

    // Test to see if the tree has the correct number of leaves
    const group = member.groups.get("anonymous");
    expect(group).toBeDefined();
    if (group) {
      const tree = group.ratchetTree;
      expect(tree.getLeaves(tree.height).length).toBe(2);
      // The admin threshold should be 1
      expect(group.threshold).toBe(1);
    }
  });

  test.skip("test_automate_group_creation", async () => {
    // Test with 40 members
    let groupName = "anonymous";
    let size = 40;
    let groupCapacity = 128;
    let members = await Member.automateGroupCreation(
      groupName,
      size,
      groupCapacity,
    );
    let message = new TextEncoder().encode("This is a test!");

    // Assert that we have 40 members
    expect(members.length).toBe(40);

    // Assert that they all have the correct group key
    // Test by encrypting to arbitrary members
    let { ciphertext, nonce, messageCounter } =
      await members[4].encryptApplicationMessage(message, groupName);
    let decryptedMessage = await members[35].decryptApplicationMessage(
      ciphertext,
      groupName,
      nonce,
      messageCounter,
    );
    expect(decryptedMessage).toEqual(message);

    // Test with 127 members
    groupName = "anonymous2";
    size = 127;
    groupCapacity = 128;
    members = await Member.automateGroupCreation(
      groupName,
      size,
      groupCapacity,
    );
    message = new TextEncoder().encode("This is a test!");

    // Assert that we have 127 members
    expect(members.length).toBe(127);

    // Assert that they all have the correct group key
    // Test by encrypting to arbitrary members
    ({ ciphertext, nonce, messageCounter } =
      await members[4].encryptApplicationMessage(message, groupName));
    decryptedMessage = await members[35].decryptApplicationMessage(
      ciphertext,
      groupName,
      nonce,
      messageCounter,
    );
    expect(decryptedMessage).toEqual(message);

    // Assert we can add a member manually
    const alice = await Member.create("alice");
    const welcomeMessage = await members[10].sendWelcomeMessage(
      alice.credential,
      groupName,
    );
    const pathUpdateMessage = await alice.joinGroup(welcomeMessage);
    await members[10].applyUpdatePath(
      pathUpdateMessage.ciphertext,
      pathUpdateMessage.nonce,
      groupName,
      alice.id!,
    );
  }, 30000);

  test("test_add_to_group", async () => {
    // We want to test the functionality of adding a member to the leftmost open node
    const member = await Member.create("Alice");
    member.createGroup(2, "anonymous", 1);
    member.addToGroup("anonymous");

    const group = member.groups.get("anonymous");
    expect(group).toBeDefined();
    if (group) {
      const tree = group.ratchetTree;
      const node = tree.getNodeById(tree.height, 2);
      expect(node).toBeDefined();
      if (node) {
        expect(node.publicKey).toBeDefined();
        expect(node.privateKey).toBeDefined();

        // Test encryption/decryption with node keys
        const message = new Uint8Array(32).fill(5);
        const { ciphertext, newPublicKey } = node.publicKey!.encrypt(message);
        const { message: decryptedMessage, newSecretKey } =
          node.privateKey!.decrypt(ciphertext);
        expect(decryptedMessage).toEqual(message);

        // Test the node secret is there
        expect(node.nodeSecret).toBeDefined();
      }

      // Test that alice has information about admins
      expect(group.threshold).toBe(1);
      expect(group.admins.length).toBe(1);
      expect(group.admins[0]).toBe(2);
    }
  });

  test("test_blank_node", async () => {
    // We want to test that a member can remove someone and the tree is updated accordingly
    const member = await Member.create("Alice");
    const member2 = await Member.create("Bob");
    const groupName = "anonymous";

    // First generate two members and a group
    member.createGroup(4, "anonymous", 1);
    member.addToGroup("anonymous");

    // Invite a new member
    const welcomeMessage = await member.sendWelcomeMessage(
      member2.credential,
      groupName,
    );
    const pathUpdateMessage = await member2.joinGroup(welcomeMessage);
    await member.applyUpdatePath(
      pathUpdateMessage.ciphertext,
      pathUpdateMessage.nonce,
      groupName,
      member2.id!,
    );

    // Check that Alice has Bob in her tree. Bob occupies the node with id of 5
    let aliceGroup = member.groups.get("anonymous");
    expect(aliceGroup).toBeDefined();
    if (aliceGroup) {
      expect(
        aliceGroup.ratchetTree.getNodeById(aliceGroup.ratchetTree.height, 5)
          ?.publicKey,
      ).toBeDefined();
    }

    // Now we remove Bob and check that every leaf is empty
    await member.blankNode(groupName, 5);
    aliceGroup = member.groups.get("anonymous");
    if (aliceGroup) {
      const aliceTree = aliceGroup.ratchetTree;
      expect(aliceTree.getNodeById(aliceTree.height, 5)?.publicKey).toBeNull();
      expect(aliceTree.getNodeById(aliceTree.height, 5)?.credential).toBeNull();
      expect(aliceTree.getNodeById(aliceTree.height, 6)?.publicKey).toBeNull();
      expect(aliceTree.getNodeById(aliceTree.height, 7)?.publicKey).toBeNull();
    }
  });

  test("test_apply_blank_message", async () => {
    const member = await Member.create("Alice");
    const member2 = await Member.create("Bob");
    const member3 = await Member.create("Mike");
    const groupName = "anonymous";
    const testMessage = new TextEncoder().encode("Well, lets see if it works!");

    member.createGroup(4, "anonymous", 1);
    member.addToGroup("anonymous");

    // Add Bob
    const welcomeMessage = await member.sendWelcomeMessage(
      member2.credential,
      groupName,
    );
    const pathUpdateMessage = await member2.joinGroup(welcomeMessage);
    await member.applyUpdatePath(
      pathUpdateMessage.ciphertext,
      pathUpdateMessage.nonce,
      groupName,
      member2.id!,
    );

    // Add Mike
    const welcomeMessage3 = await member.sendWelcomeMessage(
      member3.credential,
      groupName,
    );
    const pathUpdateMessage3 = await member3.joinGroup(welcomeMessage3);
    await member.applyUpdatePath(
      pathUpdateMessage3.ciphertext,
      pathUpdateMessage3.nonce,
      groupName,
      member3.id!,
    );
    await member2.applyUpdatePath(
      pathUpdateMessage3.ciphertext,
      pathUpdateMessage3.nonce,
      groupName,
      member3.id!,
    );

    // Verify Alice and Bob have Mike now
    let aliceGroup = member.groups.get("anonymous");
    let bobGroup = member2.groups.get("anonymous");
    expect(
      aliceGroup?.ratchetTree.getNodeById(aliceGroup.ratchetTree.height, 6)
        ?.publicKey,
    ).toBeDefined();
    expect(
      bobGroup?.ratchetTree.getNodeById(bobGroup.ratchetTree.height, 6)
        ?.publicKey,
    ).toBeDefined();

    // Check ancestor keys match
    const bobsAncestorSecret = bobGroup?.ratchetTree
      .getNodeById(bobGroup.ratchetTree.height, 2)
      ?.privateKey?.toBytes();
    const aliceAncestorSecret = aliceGroup?.ratchetTree
      .getNodeById(aliceGroup.ratchetTree.height, 2)
      ?.privateKey?.toBytes();
    expect(bobsAncestorSecret).toEqual(aliceAncestorSecret);

    // Remove Mike
    const blankMessage = await member.blankNode(groupName, member3.id!);
    aliceGroup = member.groups.get("anonymous");
    expect(
      aliceGroup?.ratchetTree.getNodeById(
        aliceGroup.ratchetTree.height,
        member3.id!,
      )?.publicKey,
    ).toBeNull();

    // Bob should still have Mike (before applying blank message)
    bobGroup = member2.groups.get("anonymous");
    expect(
      bobGroup?.ratchetTree.getNodeById(
        bobGroup.ratchetTree.height,
        member3.id!,
      )?.publicKey,
    ).toBeDefined();

    // Apply blank message to Bob
    await member2.applyBlankMessage(groupName, blankMessage);
    bobGroup = member2.groups.get("anonymous");
    aliceGroup = member.groups.get("anonymous");

    // Verify Bob no longer has Mike
    expect(
      bobGroup?.ratchetTree.getNodeById(
        bobGroup.ratchetTree.height,
        member3.id!,
      )?.publicKey,
    ).toBeNull();

    // Verify root keys match
    const bobRootKey = bobGroup?.ratchetTree
      .getNodeById(bobGroup.ratchetTree.height, 1)
      ?.publicKey?.toBytes();
    const aliceRootKey = aliceGroup?.ratchetTree
      .getNodeById(aliceGroup.ratchetTree.height, 1)
      ?.publicKey?.toBytes();
    expect(bobRootKey).toEqual(aliceRootKey);

    // Bob encrypts, Alice decrypts successfully
    const { ciphertext, nonce, messageCounter } =
      await member2.encryptApplicationMessage(testMessage, groupName);
    const plaintext = await member.decryptApplicationMessage(
      ciphertext,
      groupName,
      nonce,
      messageCounter,
    );
    expect(plaintext).toEqual(testMessage);

    // Mike should NOT be able to decrypt
    await expect(
      member3.decryptApplicationMessage(
        ciphertext,
        groupName,
        nonce,
        messageCounter,
      ),
    ).rejects.toThrow("aes/gcm: invalid ghash tag");
    // const plaintextMike = await member3.decryptApplicationMessage(
    //   ciphertext,
    //   groupName,
    //   nonce,
    //   messageCounter,
    // );
    // expect(plaintextMike).not.toEqual(testMessage);
  });

  test("test_apply_update_path", async () => {
    const member = await Member.create("Alice");
    const member2 = await Member.create("Bob");
    const groupName = "anonymous";

    member.createGroup(4, "anonymous", 1);
    member.addToGroup("anonymous");

    // Bob joins
    const welcomeMessage = await member.sendWelcomeMessage(
      member2.credential,
      groupName,
    );
    const pathUpdateMessage = await member2.joinGroup(welcomeMessage);
    await member.applyUpdatePath(
      pathUpdateMessage.ciphertext,
      pathUpdateMessage.nonce,
      groupName,
      member2.id!,
    );

    // Test that both Alice and Bob have the same root key material
    const aliceGroup = member.groups.get("anonymous");
    const bobGroup = member2.groups.get("anonymous");

    expect(aliceGroup).toBeDefined();
    expect(bobGroup).toBeDefined();

    if (aliceGroup && bobGroup) {
      const aliceTree = aliceGroup.ratchetTree;
      const bobTree = bobGroup.ratchetTree;

      // Test encryption/decryption with root keys
      const message = new Uint8Array(32).fill(5);
      const { ciphertext } = aliceTree
        .getNodeById(aliceTree.height, 1)!
        .publicKey!.encrypt(message);
      const { message: decryptedMessage } = bobTree
        .getNodeById(bobTree.height, 1)!
        .privateKey!.decrypt(ciphertext);
      expect(decryptedMessage).toEqual(message);

      // Test direct ancestor (node 2)
      const { ciphertext: c2 } = aliceTree
        .getNodeById(aliceTree.height, 2)!
        .publicKey!.encrypt(message);
      const { message: m2 } = bobTree
        .getNodeById(bobTree.height, 2)!
        .privateKey!.decrypt(c2);
      expect(m2).toEqual(message);

      // Verify Bob's node is populated in Alice's tree
      expect(
        aliceTree.getNodeById(aliceTree.height, 5)?.publicKey,
      ).toBeDefined();
      expect(
        aliceTree.getNodeById(aliceTree.height, 5)?.credential,
      ).toBeDefined();
      expect(
        aliceTree.getNodeById(aliceTree.height, 5)?.credential?.pseudonym,
      ).toBe("Bob");

      // Verify empty nodes
      expect(aliceTree.getNodeById(aliceTree.height, 6)?.publicKey).toBeNull();
      expect(aliceTree.getNodeById(aliceTree.height, 7)?.publicKey).toBeNull();
      expect(aliceTree.getNodeById(aliceTree.height, 3)?.publicKey).toBeNull();
    }

    // Test with third member
    const member3 = await Member.create("Mike");
    const welcomeMessage3 = await member2.sendWelcomeMessage(
      member3.credential,
      groupName,
    );
    const pathUpdateMessage3 = await member3.joinGroup(welcomeMessage3);
    await member.applyUpdatePath(
      pathUpdateMessage3.ciphertext,
      pathUpdateMessage3.nonce,
      groupName,
      member3.id!,
    );
    await member2.applyUpdatePath(
      pathUpdateMessage3.ciphertext,
      pathUpdateMessage3.nonce,
      groupName,
      member3.id!,
    );

    const mikeGroup = member3.groups.get("anonymous");
    const aliceGroup2 = member.groups.get("anonymous");
    const bobGroup2 = member2.groups.get("anonymous");

    if (mikeGroup && aliceGroup2 && bobGroup2) {
      const mikeTree = mikeGroup.ratchetTree;
      const aliceTree2 = aliceGroup2.ratchetTree;
      const bobTree2 = bobGroup2.ratchetTree;

      // Check credentials
      expect(
        mikeTree.getNodeById(mikeTree.height, 4)?.credential?.pseudonym,
      ).toBe("Alice");
      expect(
        mikeTree.getNodeById(mikeTree.height, 5)?.credential?.pseudonym,
      ).toBe("Bob");
      expect(
        aliceTree2.getNodeById(aliceTree2.height, 6)?.credential?.pseudonym,
      ).toBe("Mike");

      // Check root key material matches
      const message = new Uint8Array(32).fill(5);
      const { ciphertext } = aliceTree2
        .getNodeById(aliceTree2.height, 1)!
        .publicKey!.encrypt(message);
      const { message: mMike } = mikeTree
        .getNodeById(mikeTree.height, 1)!
        .privateKey!.decrypt(ciphertext);
      expect(mMike).toEqual(message);

      const { message: mBob } = bobTree2
        .getNodeById(bobTree2.height, 1)!
        .privateKey!.decrypt(ciphertext);
      expect(mBob).toEqual(message);

      // Verify Mike is in Alice and Bob's trees
      expect(
        aliceTree2.getNodeById(aliceTree2.height, 6)?.publicKey,
      ).toBeDefined();
      expect(bobTree2.getNodeById(bobTree2.height, 6)?.publicKey).toBeDefined();

      // Let's also check that Alice and Bob don't know the secret key to Mike's direct ancestor.  They aren't in the same subtrees
      // This would be node 3 but they do know the public key
      expect(
        aliceTree2.getNodeById(aliceTree2.height, 3)?.publicKey,
      ).toBeDefined();
      expect(
        aliceTree2.getNodeById(aliceTree2.height, 3)?.privateKey,
      ).toBeNull();
      expect(bobTree2.getNodeById(bobTree2.height, 3)?.publicKey).toBeDefined();
      expect(bobTree2.getNodeById(bobTree2.height, 3)?.privateKey).toBeNull();

      // Check admin information
      expect(aliceGroup2.threshold).toBe(1);
      expect(bobGroup2.threshold).toBe(1);
      expect(bobGroup2.admins.length).toBe(1);
      expect(bobGroup2.admins[0]).toBe(4);
      expect(aliceGroup2.admins.length).toBe(1);
      expect(aliceGroup2.admins[0]).toBe(4);
    }
  });

  test("test_encrypt_application_message", async () => {
    const member = await Member.create("Alice");
    member.createGroup(2, "anonymous", 1);
    member.addToGroup("anonymous");

    const message = new TextEncoder().encode("Hello to the group!");
    const { ciphertext, nonce, messageCounter } =
      await member.encryptApplicationMessage(message, "anonymous");

    // Test that the message can be decrypted using the group symmetric key
    const group = member.groups.get("anonymous");
    expect(group).toBeDefined();
    if (group) {
      const tree = group.ratchetTree;
      const root = tree.getNodeById(tree.height, 1);
      expect(root?.nodeSecret).toBeDefined();
      if (root?.nodeSecret) {
        const groupSymmetricKey = SymmetricKey.deriveMessageKey(
          root.nodeSecret,
          messageCounter,
        );
        const plaintext = SymmetricKey.decrypt(
          ciphertext,
          groupSymmetricKey,
          nonce,
        );
        expect(plaintext).toEqual(message);
      }
    }
  });

  test("test_decrypt_application_message", async () => {
    const member = await Member.create("Bob");
    member.createGroup(2, "anonymous", 1);
    member.addToGroup("anonymous");

    const message = new TextEncoder().encode("Hello to the group!");
    const group = member.groups.get("anonymous");
    expect(group).toBeDefined();

    if (group) {
      const tree = group.ratchetTree;
      const root = tree.getNodeById(tree.height, 1);
      expect(root?.nodeSecret).toBeDefined();

      if (root?.nodeSecret) {
        const groupSymmetricKey = SymmetricKey.deriveMessageKey(
          root.nodeSecret,
          1,
        );
        const { ciphertext, nonce } = SymmetricKey.encrypt(
          message,
          groupSymmetricKey,
        );
        const plaintext = await member.decryptApplicationMessage(
          ciphertext,
          "anonymous",
          nonce,
          1,
        );
        expect(plaintext).toEqual(message);
      }
    }
  });

  test("test_join_group", async () => {
    const member = await Member.create("Bob");
    const member2 = await Member.create("Alice");

    member.createGroup(2, "anonymous", 1);
    member.addToGroup("anonymous");

    const groupName = "anonymous";
    const welcomeMessage = await member.sendWelcomeMessage(
      member2.credential,
      groupName,
    );

    console.log("welcome message");
    console.log(welcomeMessage);

    await member2.joinGroup(welcomeMessage);

    // Test that there are two members
    const aliceGroup = member2.groups.get("anonymous");
    expect(aliceGroup).toBeDefined();

    if (aliceGroup) {
      const aliceTree = aliceGroup.ratchetTree;
      expect(aliceTree.getLeaves(aliceTree.height).length).toBe(2);

      // Test that Bob's key material is in Alice's tree
      expect(
        aliceTree.getNodeById(aliceTree.height, 2)?.publicKey,
      ).toBeDefined();

      // Test that Alice's key material is in Alice's tree
      expect(
        aliceTree.getNodeById(aliceTree.height, 3)?.publicKey,
      ).toBeDefined();

      // Test that the root key material is in Alice's tree
      expect(
        aliceTree.getNodeById(aliceTree.height, 1)?.publicKey,
      ).toBeDefined();

      // Test that Bob's original key material is correct in Alice's tree
      const message = new Uint8Array(32).fill(5);
      const bobGroup = member.groups.get("anonymous");

      if (bobGroup) {
        const bobTree = bobGroup.ratchetTree;
        const { ciphertext } = aliceTree
          .getNodeById(aliceTree.height, 2)!
          .publicKey!.encrypt(message);
        const { message: m } = bobTree
          .getNodeById(aliceTree.height, 2)!
          .privateKey!.decrypt(ciphertext);
        expect(m).toEqual(message);

        // Test that Bob's tree doesn't yet have Alice's key info
        // It needs to be shared after Alice adds herself to the tree.  Bob should still have his
        // own key material however
        expect(bobTree.getNodeById(bobTree.height, 3)?.publicKey).toBeNull();
        expect(bobTree.getNodeById(bobTree.height, 2)?.publicKey).toBeDefined();

        // Test that Bob has correct info about the admins
        expect(bobGroup.admins.length).toBe(1);
        expect(bobGroup.admins[0]).toBe(2);
        expect(bobGroup.threshold).toBe(1);
      }
    }
  });

  test("test_key_refresh", async () => {
    const message = new TextEncoder().encode("Hello to the group!");
    const member = await Member.create("Alice");
    const member2 = await Member.create("Bob");
    const groupName = "anonymous";
    let alicePublicKey: Uint8Array;

    member.createGroup(4, "anonymous", 1);
    member.addToGroup("anonymous");

    // Bob joins
    const welcomeMessage = await member.sendWelcomeMessage(
      member2.credential,
      groupName,
    );
    const pathUpdateMessage = await member2.joinGroup(welcomeMessage);
    await member.applyUpdatePath(
      pathUpdateMessage.ciphertext,
      pathUpdateMessage.nonce,
      groupName,
      member2.id!,
    );

    // Test encryption/decryption before refresh
    let { ciphertext, nonce, messageCounter } =
      await member.encryptApplicationMessage(message, groupName);
    let plaintext = await member2.decryptApplicationMessage(
      ciphertext,
      groupName,
      nonce,
      messageCounter,
    );
    expect(plaintext).toEqual(message);

    // Save Alice's old public key
    const aliceGroup = member.groups.get("anonymous");
    if (aliceGroup) {
      const aliceTree = aliceGroup.ratchetTree;
      alicePublicKey = aliceTree
        .getNodeById(aliceTree.height, member.id!)!
        .publicKey!.toBytes();
    }

    // Refresh Alice's keys
    const pathUpdateMessageRefresh = await member.keyRefresh(
      "anonymous",
      member.id!,
      member.pseudonym,
    );
    await member2.applyUpdatePath(
      pathUpdateMessageRefresh.ciphertext,
      pathUpdateMessageRefresh.nonce,
      groupName,
      member.id!,
    );

    // Old message should NOT decrypt correctly with new keys
    await expect(
      member2.decryptApplicationMessage(
        ciphertext,
        groupName,
        nonce,
        messageCounter,
      ),
    ).rejects.toThrow("aes/gcm: invalid ghash tag");

    // Alice's public key should be different
    const aliceGroup2 = member.groups.get("anonymous");
    if (aliceGroup2) {
      const aliceTree2 = aliceGroup2.ratchetTree;
      const newAlicePublicKey = aliceTree2
        .getNodeById(aliceTree2.height, member.id!)!
        .publicKey!.toBytes();
      expect(newAlicePublicKey).not.toEqual(alicePublicKey!);
    }

    // New messages should work correctly
    ({ ciphertext, nonce, messageCounter } =
      await member.encryptApplicationMessage(message, groupName));
    plaintext = await member2.decryptApplicationMessage(
      ciphertext,
      groupName,
      nonce,
      messageCounter,
    );
    expect(plaintext).toEqual(message);
  });
});
