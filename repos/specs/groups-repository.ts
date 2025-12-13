export interface Group {
  id: number;
  name: string;
  lastActiveAt: number;
  createdAt: number;
  updatedAt: number;
}

export default interface GroupsRepository {
  create(name: string): Promise<Group>;
  get(id: number): Promise<Group | null>;
  getByName(name: string): Promise<Group | null>;
  list(): Promise<Group[]>;
  update(
    id: number,
    updates: Partial<Pick<Group, "name" | "lastActiveAt">>,
  ): Promise<Group>;
  delete(id: number): Promise<void>;
  updateLastActiveAt(id: number): Promise<void>;
}
