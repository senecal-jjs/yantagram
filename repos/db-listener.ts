import EventEmitter from "eventemitter3";

class DBListener extends EventEmitter {
  private static instance: DBListener;

  private constructor() {
    super();
  }

  static getInstance(): DBListener {
    if (!DBListener.instance) {
      DBListener.instance = new DBListener();
    }
    return DBListener.instance;
  }

  notifyMessageChange() {
    this.emit("messages:changed");
  }

  onMessageChange(callback: () => void) {
    this.on("messages:changed", callback);
  }

  removeMessageChangeListener(callback: () => void) {
    this.off("messages:changed", callback);
  }

  notifyGroupCreation() {
    this.emit("groups:created");
  }

  onGroupCreation(callback: () => void) {
    this.on("groups:created", callback);
  }

  removeGroupCreationListener(callback: () => void) {
    this.off("groups:created", callback);
  }

  notifyGroupUpdate() {
    this.emit("groups:updated");
  }

  onGroupUpdate(callback: () => void) {
    this.on("groups:updated", callback);
  }

  removeGroupUpdateListener(callback: () => void) {
    this.off("groups:updated", callback);
  }

  notifyContactUpdate() {
    this.emit("contacts:updated");
  }

  onContactUpdate(callback: () => void) {
    this.on("contacts:updated", callback);
  }

  removeContactUpdateListener(callback: () => void) {
    this.off("contacts:updated", callback);
  }
}

export const dbListener = DBListener.getInstance();
