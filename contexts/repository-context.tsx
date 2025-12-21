import SQContactsRepository from "@/repos/impls/sq-contacts-repository";
import SQFragmentsRepository from "@/repos/impls/sq-fragments-repository";
import SQGroupMembersRepository from "@/repos/impls/sq-group-members-repository";
import SQGroupsRepository from "@/repos/impls/sq-groups-repository";
import SQIncomingPacketsRepository from "@/repos/impls/sq-incoming-packets-repository";
import SQMessagesRepository from "@/repos/impls/sq-messages-repository";
import SQOutgoingMessagesRepository from "@/repos/impls/sq-outgoing-messages-repository";
import SQRelayPacketsRepository from "@/repos/impls/sq-relay-packets-repository";
import Repository from "@/repos/specs/repository";
import { useSQLiteContext } from "expo-sqlite";
import React, { createContext, useContext } from "react";

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
    return repoMap;
  }, [db]);

  function getRepo<T extends Repository>(token: symbol): T {
    const repo = repos.get(token);

    if (repo === undefined)
      throw new Error(`Cannot find repository for ${String(token)}`);

    return repo as T;
  }

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
