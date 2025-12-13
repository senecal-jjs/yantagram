export interface GroupMember {
  contactId: number;
  groupId: number;
}

export interface GroupMembersRepository {
  add(groupId: number, contactId: number): Promise<GroupMember>;
  remove(groupId: number, contactId: number): Promise<void>;
  getByGroup(groupId: number): Promise<GroupMember[]>;
  getByContact(contactId: number): Promise<GroupMember[]>;
  isMember(groupId: number, contactId: number): Promise<boolean>;
  removeAllFromGroup(groupId: number): Promise<void>;
  removeContactFromAllGroups(contactId: number): Promise<void>;
}
