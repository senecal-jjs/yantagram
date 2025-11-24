import { Message } from "@/types/global";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRepos } from "./repository-context";

interface MessageContextType {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

const MessageContext = createContext<MessageContextType | undefined>(undefined);

export const MessageProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { getRepo } = useRepos();
  const messagesRepo = useMemo(() => getRepo("messagesRepo"), [getRepo]);
  const [messages, setMessages] = useState<Message[]>([]);
  const value = { messages, setMessages };

  useEffect(() => {
    const initialFetchData = async (limit: number) => {
      console.log("fetching messages from db");
      const initialMessages = await messagesRepo.getAll(limit);
      setMessages(initialMessages);
    };

    initialFetchData(50);
  }, [messagesRepo]);

  return (
    <MessageContext.Provider value={value}>{children}</MessageContext.Provider>
  );
};

export const useMessageProvider = () => {
  const context = useContext(MessageContext);

  if (context === undefined) {
    throw new Error("useMessageProvider must be used within a MessageProvider");
  }

  return context;
};
