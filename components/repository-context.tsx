import SQMessageRepository from "@/repos/impls/sq-message-repository";
import MessageRepository from "@/repos/specs/message-repository";
import { useSQLiteContext } from "expo-sqlite";
import React, { createContext, useContext } from "react";

interface RepositoryContextType {
  repos: Map<string, MessageRepository>;
  getRepo: (name: string) => MessageRepository;
}

const RepositoryContext = createContext<RepositoryContextType | undefined>(
  undefined,
);

export const RepositoryProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const db = useSQLiteContext();
  const repos = new Map<string, MessageRepository>();

  repos.set("messagesRepo", new SQMessageRepository(db));

  const getRepo = (name: string): MessageRepository => {
    const repo = repos.get(name);

    if (repo === undefined) throw new Error(`Cannot find repository ${name}`);

    return repo;
  };

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
