import * as SQLite from "expo-sqlite";
import {
  GroupMember,
  GroupMembersRepository,
} from "../specs/group-members-repository";
import Repository from "../specs/repository";

class SQGroupMembersRepository implements GroupMembersRepository, Repository {
  private db: SQLite.SQLiteDatabase;

  constructor(database: SQLite.SQLiteDatabase) {
    this.db = database;
  }

  async add(groupId: number, contactId: number): Promise<GroupMember> {
    const statement = await this.db.prepareAsync(
      `INSERT INTO group_members (group_id, contact_id) 
       VALUES ($groupId, $contactId)`,
    );

    try {
      await statement.executeAsync({
        $groupId: groupId,
        $contactId: contactId,
      });

      return {
        groupId,
        contactId,
      };
    } finally {
      await statement.finalizeAsync();
    }
  }

  async remove(groupId: number, contactId: number): Promise<void> {
    const statement = await this.db.prepareAsync(
      "DELETE FROM group_members WHERE group_id = $groupId AND contact_id = $contactId",
    );

    try {
      await statement.executeAsync({
        $groupId: groupId,
        $contactId: contactId,
      });
    } finally {
      await statement.finalizeAsync();
    }
  }

  async getByGroup(groupId: number): Promise<GroupMember[]> {
    const statement = await this.db.prepareAsync(
      "SELECT group_id, contact_id FROM group_members WHERE group_id = $groupId",
    );

    try {
      const result = await statement.executeAsync<{
        group_id: number;
        contact_id: number;
      }>({ $groupId: groupId });

      const rows = await result.getAllAsync();

      return rows.map((row) => this.mapRowToGroupMember(row));
    } finally {
      await statement.finalizeAsync();
    }
  }

  async getByContact(contactId: number): Promise<GroupMember[]> {
    const statement = await this.db.prepareAsync(
      "SELECT group_id, contact_id FROM group_members WHERE contact_id = $contactId",
    );

    try {
      const result = await statement.executeAsync<{
        group_id: number;
        contact_id: number;
      }>({ $contactId: contactId });

      const rows = await result.getAllAsync();

      return rows.map((row) => this.mapRowToGroupMember(row));
    } finally {
      await statement.finalizeAsync();
    }
  }

  async isMember(groupId: number, contactId: number): Promise<boolean> {
    const statement = await this.db.prepareAsync(
      "SELECT 1 FROM group_members WHERE group_id = $groupId AND contact_id = $contactId LIMIT 1",
    );

    try {
      const result = await statement.executeAsync<{ 1: number }>({
        $groupId: groupId,
        $contactId: contactId,
      });

      const row = await result.getFirstAsync();

      return row !== null;
    } finally {
      await statement.finalizeAsync();
    }
  }

  async removeAllFromGroup(groupId: number): Promise<void> {
    const statement = await this.db.prepareAsync(
      "DELETE FROM group_members WHERE group_id = $groupId",
    );

    try {
      await statement.executeAsync({ $groupId: groupId });
    } finally {
      await statement.finalizeAsync();
    }
  }

  async removeContactFromAllGroups(contactId: number): Promise<void> {
    const statement = await this.db.prepareAsync(
      "DELETE FROM group_members WHERE contact_id = $contactId",
    );

    try {
      await statement.executeAsync({ $contactId: contactId });
    } finally {
      await statement.finalizeAsync();
    }
  }

  private mapRowToGroupMember(row: {
    group_id: number;
    contact_id: number;
  }): GroupMember {
    return {
      groupId: row.group_id,
      contactId: row.contact_id,
    };
  }
}

export default SQGroupMembersRepository;
