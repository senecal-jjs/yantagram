/**
 * Binary tree structure for TreeKEM ratchet tree
 */

import { Credentials, SerializedCredentials } from "./types";
import { PublicKey, SecretKey } from "./upke";

/**
 * Node in the binary tree
 */
export class Node {
  id: number;
  left: Node | null;
  right: Node | null;
  publicKey: PublicKey | null;
  privateKey: SecretKey | null;
  nodeSecret: Uint8Array | null;
  credential: Credentials | null;

  constructor(id: number) {
    this.id = id;
    this.left = null;
    this.right = null;
    this.publicKey = null;
    this.privateKey = null;
    this.nodeSecret = null;
    this.credential = null;
  }
}

/**
 * Binary tree for the ratchet tree structure
 */
export class BinaryTree {
  root: Node | null;
  members: number;
  capacity: number;
  height: number;
  serializedPublicKeys = new Map<number, Uint8Array>();
  serializedPrivateKeys = new Map<number, Uint8Array>();
  serializedCredentials = new Map<number, Credentials>();

  constructor(capacity: number) {
    this.members = 0;
    this.capacity = capacity;
    this.height = Math.floor(Math.log2(capacity)) + 1;
    this.root = null;
  }

  /**
   * Generate a balanced binary tree with given capacity
   */
  static generate(capacity: number): BinaryTree {
    const tree = new BinaryTree(capacity);
    tree.root = tree.populateTree(tree.height, 1);
    return tree;
  }

  /**
   * Helper to populate the tree recursively
   */
  private populateTree(height: number, rootId: number): Node | null {
    if (height > 0) {
      const node = new Node(rootId);
      if (height > 1) {
        const leftId = 2 * rootId;
        const rightId = 2 * rootId + 1;
        node.left = this.populateTree(height - 1, leftId);
        node.right = this.populateTree(height - 1, rightId);
      }
      return node;
    }
    return null;
  }

  /**
   * Get all leaf nodes in the tree
   */
  getLeaves(height: number): Node[] {
    const leaves: Node[] = [];
    this.getLeavesHelper(this.root, height, leaves);
    return leaves;
  }

  private getLeavesHelper(
    currentNode: Node | null,
    height: number,
    leaves: Node[],
  ): void {
    if (!currentNode) return;

    if (height > 1) {
      this.getLeavesHelper(currentNode.left, height - 1, leaves);
      this.getLeavesHelper(currentNode.right, height - 1, leaves);
    } else {
      leaves.push(currentNode);
    }
  }

  /**
   * Get neighbor of a node by ID
   */
  getNeighbor(height: number, id: number): Node | null {
    if (!this.root) return null;
    return this.getNeighborHelper(this.root, height, id);
  }

  private getNeighborHelper(
    currentNode: Node,
    height: number,
    id: number,
  ): Node | null {
    if (height > 1) {
      if (currentNode.left?.id === id) {
        return currentNode.right;
      } else if (currentNode.right?.id === id) {
        return currentNode.left;
      } else {
        const foundLeft = currentNode.left
          ? this.getNeighborHelper(currentNode.left, height - 1, id)
          : null;
        if (foundLeft) return foundLeft;

        const foundRight = currentNode.right
          ? this.getNeighborHelper(currentNode.right, height - 1, id)
          : null;
        if (foundRight) return foundRight;
      }
    }
    return null;
  }

  /**
   * Get ancestor IDs for a node
   */
  getAncestorIds(id: number): number[] {
    const nodes = this.getAncestors(this.height, id);
    return nodes.map((node) => node.id);
  }

  /**
   * Get nodes to encrypt blank message to (nodes NOT in ancestor path)
   */
  getBlankNodePath(height: number, id: number, ancestors: number[]): Node[] {
    const blankPath: Node[] = [];
    this.getBlankNodePathHelper(this.root, height, id, blankPath, ancestors);
    return blankPath;
  }

  private getBlankNodePathHelper(
    currentNode: Node | null,
    height: number,
    id: number,
    blankPath: Node[],
    ancestors: number[],
  ): boolean {
    if (!currentNode) return false;

    if (!ancestors.includes(currentNode.id)) {
      if (currentNode.id !== id) {
        blankPath.push(currentNode);
        return true;
      }
    }

    if (height > 1) {
      const foundInLeft = this.getBlankNodePathHelper(
        currentNode.left,
        height - 1,
        id,
        blankPath,
        ancestors,
      );
      const foundInRight = this.getBlankNodePathHelper(
        currentNode.right,
        height - 1,
        id,
        blankPath,
        ancestors,
      );

      return foundInLeft || foundInRight;
    }

    return false;
  }

  /**
   * Get all ancestors (path to root) for a node
   */
  getAncestors(height: number, id: number): Node[] {
    const ancestors: Node[] = [];
    this.getAncestorsHelper(this.root, height, id, ancestors);
    return ancestors;
  }

  private getAncestorsHelper(
    currentNode: Node | null,
    height: number,
    id: number,
    ancestors: Node[],
  ): boolean {
    if (!currentNode) return false;

    if (currentNode.id === id) {
      return true;
    }

    if (height > 1) {
      if (
        this.getAncestorsHelper(currentNode.left, height - 1, id, ancestors)
      ) {
        ancestors.push(currentNode);
        return true;
      }

      if (
        this.getAncestorsHelper(currentNode.right, height - 1, id, ancestors)
      ) {
        ancestors.push(currentNode);
        return true;
      }
    }

    return false;
  }

  /**
   * Get node by its ID
   */
  getNodeById(height: number, id: number): Node | null {
    if (!this.root) return null;
    return this.getNodeByIdHelper(this.root, height, id);
  }

  private getNodeByIdHelper(
    currentNode: Node,
    height: number,
    id: number,
  ): Node | null {
    if (height === 1 && currentNode.id === id) {
      return currentNode;
    }

    if (height > 1) {
      if (currentNode.id === id) {
        return currentNode;
      } else {
        const foundNode = currentNode.left
          ? this.getNodeByIdHelper(currentNode.left, height - 1, id)
          : null;
        if (foundNode) return foundNode;

        return currentNode.right
          ? this.getNodeByIdHelper(currentNode.right, height - 1, id)
          : null;
      }
    }

    return null;
  }

  /**
   * Get leftmost open leaf node
   */
  getLeftmostOpenLeaf(height: number): number | null {
    const leaves = this.getLeaves(height);
    const ids = leaves.map((leaf) => leaf.id).sort((a, b) => a - b);

    for (const id of ids) {
      const node = this.getNodeById(this.height, id);
      if (node && !node.publicKey) {
        return id;
      }
    }

    return null;
  }

  /**
   * Serialize tree for sharing with new members
   */
  serializeTree(
    initiatingId: number,
    ancestors: number[],
    neighborAncestors: number[],
  ): {
    publicKeys: Map<number, string>;
    privateKeys: Map<number, string>;
    credentials: Map<number, SerializedCredentials>;
  } {
    // const publicKeys = new Map<number, Uint8Array>();
    // const privateKeys = new Map<number, Uint8Array>();
    // const credentials = new Map<number, Credentials>();
    this.serializedPublicKeys.clear();
    this.serializedPrivateKeys.clear();
    this.serializedCredentials.clear();

    this.serializeTreeHelper(
      this.root,
      this.height,
      // publicKeys,
      // privateKeys,
      // credentials,
      ancestors,
      neighborAncestors,
    );

    // convert binary data to base64 for compatibility with JSON.stringify
    const publicKeysBase64 = new Map<number, string>();
    const privateKeysBase64 = new Map<number, string>();
    const credentialsBase64 = new Map<number, SerializedCredentials>();

    for (const [id, bytes] of this.serializedPublicKeys.entries()) {
      publicKeysBase64.set(id, Buffer.from(bytes).toString("base64"));
    }

    for (const [id, bytes] of this.serializedPrivateKeys.entries()) {
      privateKeysBase64.set(id, Buffer.from(bytes).toString("base64"));
    }

    for (const [id, creds] of this.serializedCredentials.entries()) {
      credentialsBase64.set(id, {
        verificationKey: Buffer.from(creds.verificationKey).toString("base64"),
        pseudonym: creds.pseudonym,
        signature: Buffer.from(creds.signature).toString("base64"),
        ecdhPublicKey: Buffer.from(creds.ecdhPublicKey).toString("base64"),
      });
    }

    return {
      publicKeys: publicKeysBase64,
      privateKeys: privateKeysBase64,
      credentials: credentialsBase64,
    };
  }

  private serializeTreeHelper(
    currentNode: Node | null,
    height: number,
    // publicKeys: Map<number, Uint8Array>,
    // privateKeys: Map<number, Uint8Array>,
    // credentials: Map<number, Credentials>,
    ancestors: number[],
    neighborAncestors: number[],
  ) {
    if (!currentNode) return;

    if (currentNode.publicKey) {
      this.serializedPublicKeys.set(
        currentNode.id,
        currentNode.publicKey.toBytes(),
      );
      // publicKeys.set(currentNode.id, currentNode.publicKey.toBytes());

      if (currentNode.credential) {
        this.serializedCredentials.set(currentNode.id, currentNode.credential);
        // credentials.set(currentNode.id, currentNode.credential);
      }

      if (currentNode.privateKey) {
        if (
          ancestors.includes(currentNode.id) &&
          neighborAncestors.includes(currentNode.id)
        ) {
          this.serializedPrivateKeys.set(
            currentNode.id,
            currentNode.privateKey.toBytes(),
          );
          // privateKeys.set(currentNode.id, currentNode.privateKey.toBytes());
        }
      }
    }

    if (height > 1) {
      this.serializeTreeHelper(
        currentNode.left,
        height - 1,
        // publicKeys,
        // privateKeys,
        // credentials,
        ancestors,
        neighborAncestors,
      );
      this.serializeTreeHelper(
        currentNode.right,
        height - 1,
        // publicKeys,
        // privateKeys,
        // credentials,
        ancestors,
        neighborAncestors,
      );
    }
  }

  /**
   * Deserialize tree from serialized data
   */
  static deserializeTree(
    publicKeys: Map<number, string>,
    privateKeys: Map<number, string>,
    credentials: Map<number, SerializedCredentials>,
    capacity: number,
  ): BinaryTree {
    const tree = BinaryTree.generate(capacity);

    console.log("deserializeTree");
    console.log(publicKeys);

    if (publicKeys.size > 0) {
      for (const [id, publicKeyBase64] of publicKeys.entries()) {
        const publicKeyBytes = Buffer.from(publicKeyBase64, "base64");
        const node = tree.getNodeById(tree.height, id);
        if (node) {
          node.publicKey = PublicKey.fromBytesModOrder(publicKeyBytes);
        }
      }
    }

    if (credentials.size > 0) {
      for (const [id, serializedCredential] of credentials.entries()) {
        const credential = {
          verificationKey: Buffer.from(
            serializedCredential.verificationKey,
            "base64",
          ),
          pseudonym: serializedCredential.pseudonym,
          signature: Buffer.from(serializedCredential.signature, "base64"),
          ecdhPublicKey: Buffer.from(
            serializedCredential.ecdhPublicKey,
            "base64",
          ),
        };
        const node = tree.getNodeById(tree.height, id);
        if (node) {
          node.credential = credential;
        }
      }
    }

    if (privateKeys.size > 0) {
      for (const [id, privateKeyBase64] of privateKeys.entries()) {
        const privateKeyBytes = Buffer.from(privateKeyBase64, "base64");
        const node = tree.getNodeById(tree.height, id);
        if (node) {
          node.privateKey = SecretKey.fromBytesModOrder(privateKeyBytes);
        }
      }
    }

    return tree;
  }

  /**
   * Get all node IDs in the tree
   */
  getAllNodes(height: number): number[] {
    const nodes: number[] = [];
    this.getAllNodesHelper(this.root, height, nodes);
    return nodes;
  }

  private getAllNodesHelper(
    currentNode: Node | null,
    height: number,
    nodes: number[],
  ): void {
    if (!currentNode) return;

    nodes.push(currentNode.id);

    if (height > 1) {
      this.getAllNodesHelper(currentNode.left, height - 1, nodes);
      this.getAllNodesHelper(currentNode.right, height - 1, nodes);
    }
  }

  /**
   * Get root node
   */
  getRoot(): Node | null {
    return this.root;
  }
}
