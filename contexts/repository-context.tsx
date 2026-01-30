import SQConnectedDevicesRepository from "@/repos/impls/sq-connected-devices-repository";
import SQContactsRepository from "@/repos/impls/sq-contacts-repository";
import SQFragmentsRepository from "@/repos/impls/sq-fragments-repository";
import SQGroupMembersRepository from "@/repos/impls/sq-group-members-repository";
import SQGroupsRepository from "@/repos/impls/sq-groups-repository";
import SQIncomingPacketsRepository from "@/repos/impls/sq-incoming-packets-repository";
import SQMessageDeliveryRepository from "@/repos/impls/sq-message-delivery-repository";
import SQMessagesRepository from "@/repos/impls/sq-messages-repository";
import SQOutgoingMessagesRepository from "@/repos/impls/sq-outgoing-messages-repository";
import SQPendingDecryptionRepository from "@/repos/impls/sq-pending-decryption-repository";
import SQRelayPacketsRepository from "@/repos/impls/sq-relay-packets-repository";
import SQSyncPacketsRepository from "@/repos/impls/sq-sync-packets-repository";
import Repository from "@/repos/specs/repository";
import { registerUnreadCountCallback } from "@/services/notification-service";
import { useSQLiteContext } from "expo-sqlite";
import React, { createContext, useContext, useEffect } from "react";

// Symbols to represent repository interfaces
export const MessagesRepositoryToken = Symbol("MessagesRepository");
export const FragmentsRepositoryToken = Symbol("FragmentsRepository");
export const OutgoingMessagesRepositoryToken = Symbol(
  "OutgoingMessagesRepository",
);
export const ContactsRepositoryToken = Symbol("ContactsRepository");
export const GroupsRepositoryToken = Symbol("GroupsRepository");
export const GroupMembersRepositoryToken = Symbol("GroupMembersRepository");
export const IncomingPacketsRepositoryToken = Symbol(
  "IncomingPacketsRepository",
);
export const RelayPacketsRepositoryToken = Symbol("RelayPacketsRepository");
export const ConnectedDevicesRepositoryToken = Symbol(
  "ConnectedDevicesRepository",
);
export const SyncPacketsRepositoryToken = Symbol("SyncPacketsRepository");
export const MessageDeliveryRepositoryToken = Symbol(
  "MessageDeliveryRepository",
);
export const PendingDecryptionRepositoryToken = Symbol(
  "PendingDecryptionRepository",
);

interface RepositoryContextType {
  repos: Map<symbol, Repository>;
  getRepo: <T extends Repository>(token: symbol) => T;
}

const RepositoryContext = createContext<RepositoryContextType | undefined>(
  undefined,
);

export const RepositoryProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const db = useSQLiteContext();
  const repos = React.useMemo(() => {
    const repoMap = new Map<symbol, Repository>();
    // Initialize all repositories
    repoMap.set(MessagesRepositoryToken, new SQMessagesRepository(db));
    repoMap.set(FragmentsRepositoryToken, new SQFragmentsRepository(db));
    repoMap.set(
      OutgoingMessagesRepositoryToken,
      new SQOutgoingMessagesRepository(db),
    );
    repoMap.set(ContactsRepositoryToken, new SQContactsRepository(db));
    repoMap.set(GroupsRepositoryToken, new SQGroupsRepository(db));
    repoMap.set(GroupMembersRepositoryToken, new SQGroupMembersRepository(db));
    repoMap.set(
      IncomingPacketsRepositoryToken,
      new SQIncomingPacketsRepository(db),
    );
    repoMap.set(RelayPacketsRepositoryToken, new SQRelayPacketsRepository(db));
    repoMap.set(
      ConnectedDevicesRepositoryToken,
      new SQConnectedDevicesRepository(db),
    );
    repoMap.set(SyncPacketsRepositoryToken, new SQSyncPacketsRepository(db));
    repoMap.set(
      MessageDeliveryRepositoryToken,
      new SQMessageDeliveryRepository(db),
    );
    repoMap.set(
      PendingDecryptionRepositoryToken,
      new SQPendingDecryptionRepository(db),
    );
    return repoMap;
  }, [db]);

  function getRepo<T extends Repository>(token: symbol): T {
    const repo = repos.get(token);

    if (repo === undefined)
      throw new Error(`Cannot find repository for ${String(token)}`);

    return repo as T;
  }

  // Register the unread count callback for badge sync
  useEffect(() => {
    const messagesRepo = repos.get(
      MessagesRepositoryToken,
    ) as SQMessagesRepository;
    if (messagesRepo) {
      registerUnreadCountCallback(() => messagesRepo.getUnreadCount());
    }
  }, [repos]);

  const value = { repos, getRepo };

  return (
    <RepositoryContext.Provider value={value}>
      {children}
    </RepositoryContext.Provider>
  );
};

export const useRepos = () => {
  const context = useContext(RepositoryContext);

  if (context === undefined) {
    throw new Error("useRepos must be used within a RepositoryProvider");
  }

  return context;
};
