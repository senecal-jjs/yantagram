// Test to verify that node references work correctly
class Node {
  constructor(id) {
    this.id = id;
    this.value = null;
  }
}

class Tree {
  constructor() {
    this.root = new Node(0);
    this.root.left = new Node(1);
    this.root.right = new Node(2);
  }

  getNodeById(id) {
    if (this.root.id === id) return this.root;
    if (this.root.left && this.root.left.id === id) return this.root.left;
    if (this.root.right && this.root.right.id === id) return this.root.right;
    return null;
  }
}

const tree = new Tree();
console.log("Initial tree state:");
console.log("Root value:", tree.root.value);
console.log("Left value:", tree.root.left.value);

const node = tree.getNodeById(1);
if (node) {
  node.value = "updated";
}

console.log("\nAfter update via getNodeById:");
console.log("Left value:", tree.root.left.value);
console.log("Node reference matches:", node === tree.root.left);
