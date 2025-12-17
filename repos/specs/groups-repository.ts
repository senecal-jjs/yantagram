import { UUID } from "@/types/utility";

export interface Group {
  id: UUID;
  name: string;
  lastActiveAt: number;
  createdAt: number;
  updatedAt: number;
}

export default interface GroupsRepository {
  create(id: UUID, name: string): Promise<Group>;
  get(id: UUID): Promise<Group | null>;
  getByName(name: string): Promise<Group | null>;
  list(): Promise<Group[]>;
  update(
    id: UUID,
    updates: Partial<Pick<Group, "name" | "lastActiveAt">>,
  ): Promise<Group>;
  delete(id: UUID): Promise<void>;
  updateLastActiveAt(id: UUID): Promise<void>;
}
