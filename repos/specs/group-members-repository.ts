import { UUID } from "@/types/utility";

export interface GroupMember {
  contactId: number;
  groupId: UUID;
}

export interface GroupMembersRepository {
  add(groupId: UUID, contactId: number): Promise<GroupMember>;
  remove(groupId: UUID, contactId: number): Promise<void>;
  getByGroup(groupId: UUID): Promise<GroupMember[]>;
  getByContact(contactId: number): Promise<GroupMember[]>;
  isMember(groupId: UUID, contactId: number): Promise<boolean>;
  removeAllFromGroup(groupId: UUID): Promise<void>;
  removeContactFromAllGroups(contactId: number): Promise<void>;
  deleteAll(): Promise<void>;
}
