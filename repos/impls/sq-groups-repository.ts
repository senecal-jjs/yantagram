import { UUID } from "@/types/utility";
import * as SQLite from "expo-sqlite";
import { dbListener } from "../db-listener";
import GroupsRepository, { Group } from "../specs/groups-repository";
import Repository from "../specs/repository";

class SQGroupsRepository implements GroupsRepository, Repository {
  private db: SQLite.SQLiteDatabase;

  constructor(database: SQLite.SQLiteDatabase) {
    this.db = database;
  }

  async getSingleContactGroup(contactId: number): Promise<UUID | null> {
    const statement = await this.db.prepareAsync(
      `SELECT groups.id 
       FROM groups 
       INNER JOIN group_members ON groups.id = group_members.group_id 
       WHERE group_members.contact_id = $contactId 
       GROUP BY groups.id 
       HAVING COUNT(group_members.contact_id) = 1 
       LIMIT 1`,
    );

    try {
      const result = await statement.executeAsync<{ id: string }>({
        $contactId: contactId,
      });

      const row = await result.getFirstAsync();
      return row ? row.id : null;
    } finally {
      await statement.finalizeAsync();
    }
  }

  async create(
    id: UUID,
    name: string,
    asAdmin: boolean = false,
  ): Promise<Group> {
    const statement = await this.db.prepareAsync(
      `INSERT INTO groups (id, name, admin) VALUES ($id, $name, $admin)`,
    );

    try {
      await statement.executeAsync({
        $id: id,
        $name: name,
        $admin: asAdmin,
      });

      // Fetch the created group
      const group = await this.get(id);
      if (!group) {
        throw new Error("Failed to retrieve created group");
      }

      return group;
    } finally {
      await statement.finalizeAsync();
      dbListener.notifyGroupCreation();
    }
  }

  async get(id: UUID): Promise<Group | null> {
    const statement = await this.db.prepareAsync(
      "SELECT * FROM groups WHERE id = $id LIMIT 1",
    );

    try {
      const result = await statement.executeAsync<{
        id: string;
        name: string;
        admin: number;
        last_active_at: number;
        created_at: number;
        updated_at: number;
      }>({ $id: id });

      const row = await result.getFirstAsync();

      if (!row) {
        return null;
      }

      return this.mapRowToGroup(row);
    } finally {
      await statement.finalizeAsync();
    }
  }

  async getByName(name: string): Promise<Group | null> {
    const statement = await this.db.prepareAsync(
      "SELECT * FROM groups WHERE name = $name LIMIT 1",
    );

    try {
      const result = await statement.executeAsync<{
        id: string;
        name: string;
        admin: number;
        last_active_at: number;
        created_at: number;
        updated_at: number;
      }>({ $name: name });

      const row = await result.getFirstAsync();

      if (!row) {
        return null;
      }

      return this.mapRowToGroup(row);
    } finally {
      await statement.finalizeAsync();
    }
  }

  async list(): Promise<Group[]> {
    const statement = await this.db.prepareAsync(
      "SELECT * FROM groups ORDER BY last_active_at DESC",
    );

    try {
      const result = await statement.executeAsync<{
        id: string;
        name: string;
        admin: number;
        last_active_at: number;
        created_at: number;
        updated_at: number;
      }>();

      const rows = await result.getAllAsync();

      return rows.map((row) => this.mapRowToGroup(row));
    } finally {
      await statement.finalizeAsync();
    }
  }

  async update(
    id: UUID,
    updates: Partial<Pick<Group, "name" | "lastActiveAt">>,
  ): Promise<Group> {
    const setParts: string[] = [];
    const params: Record<string, any> = { $id: id };

    if (updates.name !== undefined) {
      setParts.push("name = $name");
      params.$name = updates.name;
    }

    if (updates.lastActiveAt !== undefined) {
      setParts.push("last_active_at = $lastActiveAt");
      params.$lastActiveAt = updates.lastActiveAt;
    }

    // Always update the updated_at timestamp
    setParts.push("updated_at = strftime('%s', 'now')");

    if (setParts.length === 1) {
      // Only updated_at was set, nothing to update
      const group = await this.get(id);
      if (!group) {
        throw new Error(`Group with id ${id} not found`);
      }
      return group;
    }

    const statement = await this.db.prepareAsync(
      `UPDATE groups SET ${setParts.join(", ")} WHERE id = $id`,
    );

    try {
      await statement.executeAsync(params);

      const group = await this.get(id);
      if (!group) {
        throw new Error(`Group with id ${id} not found after update`);
      }

      return group;
    } finally {
      await statement.finalizeAsync();
      dbListener.notifyGroupUpdate();
    }
  }

  async delete(id: UUID): Promise<void> {
    const statement = await this.db.prepareAsync(
      "DELETE FROM groups WHERE id = $id",
    );

    try {
      await statement.executeAsync({ $id: id });
    } finally {
      await statement.finalizeAsync();
    }
  }

  async updateLastActiveAt(id: UUID): Promise<void> {
    const statement = await this.db.prepareAsync(
      `UPDATE groups 
       SET last_active_at = strftime('%s', 'now'),
           updated_at = strftime('%s', 'now')
       WHERE id = $id`,
    );

    try {
      await statement.executeAsync({ $id: id });
    } finally {
      await statement.finalizeAsync();
    }
  }

  private mapRowToGroup(row: {
    id: string;
    name: string;
    admin: number;
    last_active_at: number;
    created_at: number;
    updated_at: number;
  }): Group {
    return {
      id: row.id,
      name: row.name,
      admin: row.admin === 1,
      lastActiveAt: row.last_active_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export default SQGroupsRepository;
