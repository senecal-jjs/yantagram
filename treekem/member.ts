/**
 * TreeKEM group member implementation
 * Handles group creation, joining, updates, and secure messaging
 */

import { BinaryTree } from "./tree";
import {
  BlankMessage,
  Ciphertext,
  Credentials,
  SerializedTree,
  UpdateMaterial,
  UpdateMessage,
  WelcomeMessage,
} from "./types";
import {
  ECDHKeyPair,
  NodeSecret,
  PathSecret,
  PublicKey,
  SecretKey,
  SignatureMaterial,
  SymmetricKey,
  UPKEMaterial,
} from "./upke";

/**
 * Group configuration
 */
export class Group {
  threshold: number;
  admins: number[];
  ratchetTree: BinaryTree;

  constructor(threshold: number, tree: BinaryTree) {
    this.threshold = threshold;
    this.admins = [];
    this.ratchetTree = tree;
  }
}

/**
 * Member of a TreeKEM group
 */
export class Member {
  pseudonym: string;
  ecdhPublicKey: Uint8Array;
  ecdhPrivateKey: Uint8Array;
  groups: Map<string, Group>;
  id: number | null;
  credential: Credentials;
  signingKey: Uint8Array;
  messageCounter: number;

  private constructor(
    pseudonym: string,
    ecdhPublicKey: Uint8Array,
    ecdhPrivateKey: Uint8Array,
    credential: Credentials,
    signingKey: Uint8Array,
  ) {
    this.pseudonym = pseudonym;
    this.ecdhPublicKey = ecdhPublicKey;
    this.ecdhPrivateKey = ecdhPrivateKey;
    this.groups = new Map();
    this.id = null;
    this.credential = credential;
    this.signingKey = signingKey;
    this.messageCounter = 1;
  }

  /**
   * Create a new member with generated key material
   */
  static async create(pseudonym: string): Promise<Member> {
    const ecdhKeyPair = ECDHKeyPair.generate();
    const signingMaterial = SignatureMaterial.generate();

    const credential = Member.createCredential(
      signingMaterial,
      pseudonym,
      ecdhKeyPair.publicKey,
    );

    return new Member(
      pseudonym,
      ecdhKeyPair.publicKey,
      ecdhKeyPair.privateKey,
      credential,
      signingMaterial.privateKey,
    );
  }

  /**
   * Create credentials for a member
   */
  private static createCredential(
    signingMaterial: SignatureMaterial,
    pseudonym: string,
    ecdhPublicKey: Uint8Array,
  ): Credentials {
    const signature = signingMaterial.sign(signingMaterial.publicKey);

    return {
      verificationKey: signingMaterial.publicKey,
      pseudonym,
      signature,
      ecdhPublicKey,
    };
  }

  /**
   * Automate group creation with multiple members
   * Creates a group with a founding member and automatically adds all other members
   */
  static async automateGroupCreation(
    groupName: string,
    size: number,
    groupCapacity: number,
  ): Promise<Member[]> {
    // Create all the members
    const members: Member[] = [];
    for (let i = 1; i <= size; i++) {
      const member = await Member.create(`member${i}`);
      members.push(member);
    }

    const synchronizedGroup: Member[] = [];

    // Create the group with founding member
    members[0].createGroup(groupCapacity, groupName, 1);
    members[0].addToGroup(groupName);
    const foundingMember = members.shift()!;
    synchronizedGroup.push(foundingMember);

    // Loop through to add each member to the group
    let count = 0;
    while (members.length > 0) {
      const joiningMember = members.shift()!;
      const welcomeMessage = await synchronizedGroup[count].sendWelcomeMessage(
        joiningMember.credential,
        groupName,
      );
      const pathUpdateMessage = await joiningMember.joinGroup(welcomeMessage);

      // Apply update to all synchronized members
      for (const syncMember of synchronizedGroup) {
        await syncMember.applyUpdatePath(
          pathUpdateMessage.ciphertext,
          pathUpdateMessage.nonce,
          groupName,
          joiningMember.id!,
        );
      }

      synchronizedGroup.push(joiningMember);
      count++;
    }

    return synchronizedGroup;
  }

  /**
   * Create a new group
   */
  createGroup(size: number, name: string, threshold: number): void {
    const tree = BinaryTree.generate(size);
    const group = new Group(threshold, tree);
    group.admins.push(size); // Creator is admin by default
    this.groups.set(name, group);
  }

  /**
   * Add self to a group (claims leftmost open leaf)
   */
  async addToGroup(groupName: string): Promise<UpdateMessage> {
    const group = this.groups.get(groupName);
    if (!group) throw new Error(`Group ${groupName} not found`);

    const tree = group.ratchetTree;
    const openNodeId = tree.getLeftmostOpenLeaf(tree.height);
    if (!openNodeId) throw new Error("No open leaf available");

    this.id = openNodeId;

    // Generate key material
    const upkeMaterial = UPKEMaterial.generate();
    const pk = upkeMaterial.publicKey;
    const sk = upkeMaterial.privateKey;
    const nodeSecret = NodeSecret.derive(pk, sk);

    // Insert key material into tree
    const openNode = tree.getNodeById(tree.height, openNodeId);
    if (!openNode) throw new Error("Node not found");

    openNode.publicKey = pk;
    openNode.privateKey = sk;
    openNode.nodeSecret = nodeSecret;
    openNode.credential = this.credential;

    // Update path to root
    return await Member.updatePath(
      tree,
      openNodeId,
      this.pseudonym,
      this.messageCounter,
    );
  }

  /**
   * Serialize tree for sharing
   */
  async serialize(
    groupName: string,
    key: Uint8Array,
    cred: Credentials,
  ): Promise<UpdateMessage> {
    const group = this.groups.get(groupName);
    if (!group) throw new Error(`Group ${groupName} not found`);

    const neighborId = group.ratchetTree.getLeftmostOpenLeaf(
      group.ratchetTree.height,
    );
    if (!neighborId || !this.id) throw new Error("Invalid state");

    const ancestors = group.ratchetTree.getAncestorIds(this.id);
    const neighborAncestors = group.ratchetTree.getAncestorIds(neighborId);

    const { publicKeys, privateKeys, credentials } =
      group.ratchetTree.serializeTree(this.id, ancestors, neighborAncestors);

    const serializedTree: SerializedTree = {
      groupName,
      publicKeys: Array.from(publicKeys.entries()),
      privateKeys: Array.from(privateKeys.entries()),
      credentials: Array.from(credentials.entries()),
      capacity: group.ratchetTree.capacity,
      threshold: group.threshold,
      admins: group.admins,
      actionMemberCred: cred,
    };

    console.log("serialized tree");
    console.log(serializedTree);
    console.log("binary tree");
    console.log(JSON.stringify(serializedTree));
    const message = new TextEncoder().encode(JSON.stringify(serializedTree));
    const { ciphertext, nonce } = SymmetricKey.encrypt(message, key);

    return { ciphertext, nonce };
  }

  /**
   * Send welcome message to joining member
   */
  async sendWelcomeMessage(
    cred: Credentials,
    groupName: string,
  ): Promise<WelcomeMessage> {
    const group = this.groups.get(groupName);
    if (!group) throw new Error(`Group ${groupName} not found`);

    const root = group.ratchetTree.getNodeById(group.ratchetTree.height, 1);
    if (!root || !root.publicKey || !root.privateKey) {
      throw new Error("Root node not initialized");
    }

    const nodeSecret = NodeSecret.derive(root.publicKey, root.privateKey);
    const key = SymmetricKey.derive(nodeSecret);

    // Encrypt key with ECDH
    const ecdhKeyPair = new ECDHKeyPair(cred.ecdhPublicKey, new Uint8Array(32));
    const encryptedKey = await ecdhKeyPair.encrypt(key);

    const treeInfo = await this.serialize(groupName, key, cred);

    return {
      key: encryptedKey,
      updateMessage: treeInfo,
    };
  }

  /**
   * Join a group using welcome message
   */
  async joinGroup(welcomeMessage: WelcomeMessage): Promise<UpdateMessage> {
    // Decrypt symmetric key
    const ecdhKeyPair = new ECDHKeyPair(
      this.ecdhPublicKey,
      this.ecdhPrivateKey,
    );
    const decryptedKey = await ecdhKeyPair.decrypt(welcomeMessage.key);

    // Decrypt tree
    const decryptedTree = SymmetricKey.decrypt(
      welcomeMessage.updateMessage.ciphertext,
      decryptedKey,
      welcomeMessage.updateMessage.nonce,
    );

    const treeInfo: SerializedTree = JSON.parse(
      new TextDecoder().decode(decryptedTree),
    );

    console.log("tree info");
    console.log(treeInfo);

    // Deserialize tree
    const tree = BinaryTree.deserializeTree(
      new Map(treeInfo.publicKeys),
      new Map(treeInfo.privateKeys),
      new Map(treeInfo.credentials),
      treeInfo.capacity,
    );

    console.log("decrypted tree");
    console.log(tree);

    const group = new Group(treeInfo.threshold, tree);
    group.admins = treeInfo.admins;
    this.groups.set(treeInfo.groupName, group);

    // Add self to leftmost open leaf
    return this.addToGroup(treeInfo.groupName);
  }

  /**
   * Update path from leaf to root with new key material
   */
  static async updatePath(
    tree: BinaryTree,
    nodeId: number,
    _pseudo: string,
    _messageCounter: number,
  ): Promise<UpdateMessage> {
    let key = new Uint8Array(32);
    const root = tree.getNodeById(tree.height, 1);

    if (root?.publicKey && root?.privateKey) {
      const nodeSecret = NodeSecret.derive(root.publicKey, root.privateKey);
      key = SymmetricKey.derive(nodeSecret) as Uint8Array<ArrayBuffer>;
    }

    const node = tree.getNodeById(tree.height, nodeId);
    if (!node || !node.publicKey) throw new Error("Node not found");

    const publicKey = node.publicKey;

    // Get ancestors
    const nodes = tree.getAncestors(tree.height, nodeId);
    const ancestors = nodes.map((n) => n.id);

    const ancestorsNewPublicMaterial: Uint8Array[] = [];
    const updatePath: { point: Uint8Array; data: Uint8Array }[] = [];

    for (const ancestorId of ancestors) {
      const secret = PathSecret.newPathSecret();
      const newKeyMaterial = PathSecret.deriveKeyPair(secret);

      const ancestor = tree.getNodeById(tree.height, ancestorId);
      if (!ancestor) continue;

      ancestorsNewPublicMaterial.push(newKeyMaterial.publicKey.toBytes());

      if (ancestor.publicKey && ancestor.privateKey) {
        // Encrypt secret under previous public key
        const previousPublicKey = ancestor.publicKey;
        const { ciphertext } = previousPublicKey.encrypt(secret);
        updatePath.push(ciphertext);

        // Update with path secret
        const pathKeyMaterial = PathSecret.updateWithPathSecret(
          secret,
          ancestor.publicKey,
          ancestor.privateKey,
        );

        ancestor.publicKey = pathKeyMaterial.publicKey;
        ancestor.privateKey = pathKeyMaterial.privateKey;
        ancestor.nodeSecret = NodeSecret.derive(
          ancestor.publicKey,
          ancestor.privateKey,
        );
      } else {
        ancestor.publicKey = newKeyMaterial.publicKey;
        ancestor.privateKey = newKeyMaterial.privateKey;
        ancestor.nodeSecret = NodeSecret.derive(
          ancestor.publicKey,
          ancestor.privateKey,
        );
      }
    }

    const creds = node.credential;
    if (!creds) throw new Error("No credentials");

    const pathUpdateMessage: UpdateMaterial = {
      ancestors,
      publicPathMaterial: ancestorsNewPublicMaterial,
      privPathMaterial: updatePath,
      publicKey: publicKey.toBytes(),
      credentials: creds,
    };

    const message = new TextEncoder().encode(JSON.stringify(pathUpdateMessage));
    const { ciphertext, nonce } = SymmetricKey.encrypt(message, key);

    return { ciphertext, nonce };
  }

  /**
   * Refresh keys for a member and update ancestor path
   */
  async keyRefresh(
    groupName: string,
    nodeId: number,
    _pseudo: string,
  ): Promise<UpdateMessage> {
    let key = new Uint8Array(32);
    const group = this.groups.get(groupName);
    if (!group) throw new Error(`Group ${groupName} not found`);

    const tree = group.ratchetTree;
    const root = tree.getNodeById(tree.height, 1);

    if (root?.publicKey && root?.privateKey) {
      const nodeSecret = NodeSecret.derive(root.publicKey, root.privateKey);
      key = SymmetricKey.derive(nodeSecret) as Uint8Array<ArrayBuffer>;
    }

    // Generate new key material for the member
    const newMemberKeyMaterial = UPKEMaterial.generate();
    const publicKey = newMemberKeyMaterial.publicKey;

    // Get ancestors
    const nodes = tree.getAncestors(tree.height, nodeId);
    const ancestors = nodes.map((n) => n.id);

    const ancestorsNewPublicMaterial: Uint8Array[] = [];
    const ancestorsPathUpdate: { point: Uint8Array; data: Uint8Array }[] = [];

    for (const ancestorId of ancestors) {
      const pathSecret = PathSecret.newPathSecret();
      const newKeyMaterial = PathSecret.deriveKeyPair(pathSecret);

      const ancestor = tree.getNodeById(tree.height, ancestorId);
      if (!ancestor) continue;

      ancestorsNewPublicMaterial.push(newKeyMaterial.publicKey.toBytes());

      if (ancestor.publicKey && ancestor.privateKey) {
        // Encrypt secret under previous public key
        const previousPublicKey = ancestor.publicKey;
        const { ciphertext } = previousPublicKey.encrypt(pathSecret);
        ancestorsPathUpdate.push(ciphertext);

        // Update with path secret
        const pathKeyMaterial = PathSecret.updateWithPathSecret(
          pathSecret,
          ancestor.publicKey,
          ancestor.privateKey,
        );

        ancestor.publicKey = pathKeyMaterial.publicKey;
        ancestor.privateKey = pathKeyMaterial.privateKey;
        ancestor.nodeSecret = NodeSecret.derive(
          ancestor.publicKey,
          ancestor.privateKey,
        );
      } else {
        ancestor.publicKey = newKeyMaterial.publicKey;
        ancestor.privateKey = newKeyMaterial.privateKey;
        ancestor.nodeSecret = NodeSecret.derive(
          ancestor.publicKey,
          ancestor.privateKey,
        );
      }
    }

    const creds = tree.getNodeById(tree.height, nodeId)?.credential;
    if (!creds) throw new Error("No credentials");

    // Update the member node with new key material
    const memberNode = tree.getNodeById(tree.height, nodeId);
    if (memberNode) {
      memberNode.publicKey = publicKey;
      memberNode.privateKey = newMemberKeyMaterial.privateKey;
    }

    const pathUpdateMessage: UpdateMaterial = {
      ancestors,
      publicPathMaterial: ancestorsNewPublicMaterial,
      privPathMaterial: ancestorsPathUpdate,
      publicKey: publicKey.toBytes(),
      credentials: creds,
    };

    const message = new TextEncoder().encode(JSON.stringify(pathUpdateMessage));
    const { ciphertext, nonce } = SymmetricKey.encrypt(message, key);

    return { ciphertext, nonce };
  }

  /**
   * Apply update path from another member
   */
  async applyUpdatePath(
    pathUpdateMessage: Uint8Array,
    nonce: Uint8Array,
    groupName: string,
    updatingNode: number,
  ): Promise<void> {
    const group = this.groups.get(groupName);
    if (!group) throw new Error(`Group ${groupName} not found`);

    const tree = group.ratchetTree;
    const root = tree.getNodeById(tree.height, 1);
    if (!root || !root.publicKey || !root.privateKey) {
      throw new Error("Root not initialized");
    }

    const nodeSecret = NodeSecret.derive(root.publicKey, root.privateKey);
    const key = SymmetricKey.derive(nodeSecret);

    const decryptedTree = SymmetricKey.decrypt(pathUpdateMessage, key, nonce);
    const parsedMaterial = JSON.parse(new TextDecoder().decode(decryptedTree));

    // Convert objects back to Uint8Arrays
    const updateMaterial: UpdateMaterial = {
      ancestors: parsedMaterial.ancestors,
      publicPathMaterial: parsedMaterial.publicPathMaterial.map(
        (obj: any) => new Uint8Array(Object.values(obj)),
      ),
      privPathMaterial: parsedMaterial.privPathMaterial.map((obj: any) => ({
        point: new Uint8Array(Object.values(obj.point)),
        data: new Uint8Array(Object.values(obj.data)),
      })),
      publicKey: new Uint8Array(Object.values(parsedMaterial.publicKey)),
      credentials: {
        verificationKey: new Uint8Array(
          Object.values(parsedMaterial.credentials.verificationKey),
        ),
        pseudonym: parsedMaterial.credentials.pseudonym,
        signature: new Uint8Array(
          Object.values(parsedMaterial.credentials.signature),
        ),
        ecdhPublicKey: new Uint8Array(
          Object.values(parsedMaterial.credentials.ecdhPublicKey),
        ),
      },
    };

    console.log("update material");
    console.log(updateMaterial);

    while (updateMaterial.ancestors.length > 0) {
      const currentAncestor = updateMaterial.ancestors.pop()!;

      // Apply public key material
      const publicUpdate = PublicKey.fromBytesModOrder(
        updateMaterial.publicPathMaterial.pop()!,
      );
      const currentAncestorNode = tree.getNodeById(
        tree.height,
        currentAncestor,
      );

      if (!currentAncestorNode) continue;

      if (currentAncestorNode.publicKey) {
        currentAncestorNode.publicKey = PathSecret.updatePublic(
          publicUpdate,
          currentAncestorNode.publicKey,
        );
      } else {
        currentAncestorNode.publicKey = publicUpdate;
      }

      // Apply private key if this is our ancestor
      if (!this.id) continue;

      const ancestors = tree.getAncestors(tree.height, this.id);
      const ancestorIds = ancestors.map((a) => a.id);

      if (ancestorIds.includes(currentAncestor)) {
        const serializedPathSecret = updateMaterial.privPathMaterial.pop();

        if (serializedPathSecret && currentAncestorNode.privateKey) {
          const ciphertext: Ciphertext = serializedPathSecret;
          const { message: pathSecret } =
            currentAncestorNode.privateKey.decrypt(ciphertext);

          const updateKeypair = PathSecret.deriveKeyPair(pathSecret);

          if (currentAncestorNode.privateKey) {
            currentAncestorNode.privateKey = PathSecret.updatePrivate(
              updateKeypair.privateKey,
              currentAncestorNode.privateKey,
            );
          } else {
            currentAncestorNode.privateKey = updateKeypair.privateKey;
          }
        }
      }
    }

    // Update the updating node's public key and credentials
    const updatingNodeObj = tree.getNodeById(tree.height, updatingNode);
    if (updatingNodeObj) {
      updatingNodeObj.publicKey = PublicKey.fromBytesModOrder(
        updateMaterial.publicKey,
      );
      updatingNodeObj.credential = updateMaterial.credentials;
    }
  }

  /**
   * Blank (remove) a node from the tree
   */
  async blankNode(groupName: string, id: number): Promise<UpdateMessage> {
    const pathSecret = PathSecret.newPathSecret();
    const blankKeyMaterial = PathSecret.deriveKeyPair(pathSecret);

    const group = this.groups.get(groupName);
    if (!group) throw new Error(`Group ${groupName} not found`);

    const tree = group.ratchetTree;
    const root = tree.getNodeById(tree.height, 1);
    if (!root || !root.publicKey || !root.privateKey) {
      throw new Error("Root not initialized");
    }

    const nodeSecret = NodeSecret.derive(root.publicKey, root.privateKey);
    const key = SymmetricKey.derive(nodeSecret);

    const messages: BlankMessage[] = [];

    // Get nodes to encrypt under
    const ancestorsId = tree.getAncestorIds(id);
    const nodes = tree.getBlankNodePath(tree.height, id, ancestorsId);
    const nodesEncryptUnder = nodes.map((n) => n.id);

    for (const nodeId of nodesEncryptUnder) {
      const message: BlankMessage = {
        blankedNode: id,
        encryptUnder: nodeId,
      };

      const currentNode = tree.getNodeById(tree.height, nodeId);
      if (currentNode?.publicKey) {
        const { ciphertext: publicCipher } = currentNode.publicKey.encrypt(
          blankKeyMaterial.publicKey.toBytes(),
        );
        message.public = publicCipher;

        const { ciphertext: privateCipher } =
          currentNode.publicKey.encrypt(pathSecret);
        message.private = privateCipher;

        messages.push(message);
      }
    }

    this.blank(groupName, id);

    // Update all nodes with blank material
    const nodesInTree = tree.getAllNodes(tree.height);
    for (const nodeId of nodesInTree) {
      const node = tree.getNodeById(tree.height, nodeId);
      if (node?.publicKey) {
        node.publicKey = UPKEMaterial.updatePublic(
          blankKeyMaterial.publicKey,
          node.publicKey,
        );

        if (node.privateKey) {
          node.privateKey = UPKEMaterial.updatePrivate(
            blankKeyMaterial.privateKey,
            node.privateKey,
          );
        }
      }
    }

    const blankUpdate = new TextEncoder().encode(JSON.stringify(messages));
    const { ciphertext, nonce } = SymmetricKey.encrypt(blankUpdate, key);

    return { ciphertext, nonce };
  }

  /**
   * Apply blank message to remove a member
   */
  async applyBlankMessage(
    groupName: string,
    blankMessage: UpdateMessage,
  ): Promise<void> {
    const group = this.groups.get(groupName);
    if (!group) throw new Error(`Group ${groupName} not found`);

    const tree = group.ratchetTree;
    const root = tree.getNodeById(tree.height, 1);
    if (!root || !root.publicKey || !root.privateKey) {
      throw new Error("Root not initialized");
    }

    const nodeSecret = NodeSecret.derive(root.publicKey, root.privateKey);
    const key = SymmetricKey.derive(nodeSecret);

    const decryptedBlankMessage = SymmetricKey.decrypt(
      blankMessage.ciphertext,
      key,
      blankMessage.nonce,
    );

    const parsedMessages = JSON.parse(
      new TextDecoder().decode(decryptedBlankMessage),
    );

    // Convert objects back to Uint8Arrays
    const messages: BlankMessage[] = parsedMessages.map((msg: any) => ({
      blankedNode: msg.blankedNode,
      encryptUnder: msg.encryptUnder,
      public: msg.public
        ? {
            point: new Uint8Array(Object.values(msg.public.point)),
            data: new Uint8Array(Object.values(msg.public.data)),
          }
        : undefined,
      private: msg.private
        ? {
            point: new Uint8Array(Object.values(msg.private.point)),
            data: new Uint8Array(Object.values(msg.private.data)),
          }
        : undefined,
    }));

    console.log("blank messages");
    console.log(messages[0].public);

    if (!this.id) return;

    const ancestorIds = tree.getAncestorIds(this.id);

    let blankPublicMaterial: PublicKey | null = null;
    let blankPrivateMaterial: SecretKey | null = null;

    // Find message intended for us
    for (const message of messages) {
      if (
        ancestorIds.includes(message.encryptUnder) ||
        message.encryptUnder === this.id
      ) {
        const node = tree.getNodeById(tree.height, message.encryptUnder);

        if (node?.privateKey && message.public && message.private) {
          const { message: publicMaterial } = node.privateKey.decrypt(
            message.public,
          );
          blankPublicMaterial = PublicKey.fromBytesModOrder(publicMaterial);

          const { message: privateMaterial } = node.privateKey.decrypt(
            message.private,
          );
          blankPrivateMaterial =
            PathSecret.deriveKeyPair(privateMaterial).privateKey;

          this.blank(groupName, message.blankedNode);
          break;
        }
      }
    }

    if (!blankPublicMaterial || !blankPrivateMaterial) return;

    // Apply to all nodes
    const nodesInTree = tree.getAllNodes(tree.height);
    for (const nodeId of nodesInTree) {
      const node = tree.getNodeById(tree.height, nodeId);
      if (node?.publicKey) {
        node.publicKey = UPKEMaterial.updatePublic(
          blankPublicMaterial,
          node.publicKey,
        );

        if (node.privateKey) {
          node.privateKey = UPKEMaterial.updatePrivate(
            blankPrivateMaterial,
            node.privateKey,
          );
        }
      }
    }
  }

  /**
   * Blank a node (clear all key material)
   */
  blank(groupName: string, id: number): void {
    const group = this.groups.get(groupName);
    if (!group) return;

    const node = group.ratchetTree.getNodeById(group.ratchetTree.height, id);
    if (node) {
      node.nodeSecret = null;
      node.privateKey = null;
      node.publicKey = null;
      node.credential = null;
    }
  }

  /**
   * Encrypt application message
   */
  async encryptApplicationMessage(
    message: Uint8Array,
    groupName: string,
  ): Promise<{
    ciphertext: Uint8Array;
    nonce: Uint8Array;
    messageCounter: number;
  }> {
    const group = this.groups.get(groupName);
    if (!group) throw new Error(`Group ${groupName} not found`);

    const root = group.ratchetTree.getNodeById(group.ratchetTree.height, 1);
    if (!root || !root.publicKey || !root.privateKey) {
      throw new Error("Root not initialized");
    }

    const nodeSecret = NodeSecret.derive(root.publicKey, root.privateKey);
    const key = SymmetricKey.deriveMessageKey(nodeSecret, this.messageCounter);

    const { ciphertext, nonce } = SymmetricKey.encrypt(message, key);

    const messageCounter = this.messageCounter;
    this.messageCounter += 1;

    return { ciphertext, nonce, messageCounter };
  }

  /**
   * Decrypt application message
   */
  async decryptApplicationMessage(
    ciphertext: Uint8Array,
    groupName: string,
    nonce: Uint8Array,
    messageCounter: number,
  ): Promise<Uint8Array> {
    const group = this.groups.get(groupName);
    if (!group) throw new Error(`Group ${groupName} not found`);

    const root = group.ratchetTree.getNodeById(group.ratchetTree.height, 1);
    if (!root || !root.publicKey || !root.privateKey) {
      throw new Error("Root not initialized");
    }

    const nodeSecret = NodeSecret.derive(root.publicKey, root.privateKey);
    const key = SymmetricKey.deriveMessageKey(nodeSecret, messageCounter);

    const plaintext = SymmetricKey.decrypt(ciphertext, key, nonce);

    if (messageCounter < this.messageCounter) {
      this.messageCounter = this.messageCounter + 1;
    } else {
      this.messageCounter = messageCounter + 1;
    }

    return plaintext;
  }
}
