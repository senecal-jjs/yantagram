import {
  MessagesRepositoryToken,
  useRepos,
} from "@/contexts/repository-context";
import { dbListener } from "@/repos/db-listener";
import MessagesRepository from "@/repos/specs/messages-repository";
import { MessageWithPseudonym } from "@/types/global";
import { useCallback, useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 50;

export const useGroupMessages = (groupId: string) => {
  const { getRepo } = useRepos();
  const messagesRepo = useMemo(
    () => getRepo<MessagesRepository>(MessagesRepositoryToken),
    [getRepo],
  );
  const [messages, setMessages] = useState<MessageWithPseudonym[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  const fetchMessages = useCallback(
    async (reset: boolean = false) => {
      const currentOffset = reset ? 0 : offset;
      console.log("fetching messages: ", currentOffset);

      if (reset) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const groupMessages = await messagesRepo.getByGroupId(
          groupId,
          PAGE_SIZE,
          currentOffset,
        );

        if (groupMessages.length < PAGE_SIZE) {
          setHasMore(false);
        }

        if (reset) {
          setMessages(groupMessages);
          setOffset(PAGE_SIZE);
        } else {
          // Prepend older messages to the beginning, deduplicating by message ID
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.message.id));
            const newMessages = groupMessages.filter(
              (m) => !existingIds.has(m.message.id),
            );
            return [...newMessages, ...prev];
          });
          setOffset((prev) => prev + PAGE_SIZE);
        }
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [messagesRepo, groupId, offset],
  );

  const loadMore = useCallback(() => {
    if (!isLoadingMore && hasMore) {
      fetchMessages(false);
    }
  }, [fetchMessages, isLoadingMore, hasMore]);

  const refresh = useCallback(() => {
    setOffset(0);
    setHasMore(true);
    fetchMessages(true);
  }, [fetchMessages]);

  useEffect(() => {
    // Initial fetch
    refresh();

    // Listen for database changes
    const handleMessageChange = () => {
      refresh();
    };

    dbListener.onMessageChange(handleMessageChange);

    return () => {
      dbListener.removeMessageChangeListener(handleMessageChange);
    };
  }, [messagesRepo, groupId]);

  return { messages, isLoading, isLoadingMore, hasMore, loadMore, refresh };
};
