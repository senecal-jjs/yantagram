import {
  MessagesRepositoryToken,
  useRepos,
} from "@/contexts/repository-context";
import { useSettings } from "@/contexts/settings-context";
import MessagesRepository from "@/repos/specs/messages-repository";
import { useCallback, useEffect, useRef } from "react";

const CLEANUP_INTERVAL_MS = 60 * 1000; // Run cleanup every minute

/**
 * Hook that periodically removes messages older than the configured retention period.
 * Should be used once at the app root level.
 */
export function useMessageRetention() {
  const { settings } = useSettings();
  const { getRepo } = useRepos();
  const messagesRepo = getRepo<MessagesRepository>(MessagesRepositoryToken);
  const cleanupIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  const cleanupOldMessages = useCallback(async () => {
    if (!settings.autoDeleteMessages || settings.messageRetentionMinutes <= 0) {
      return;
    }

    const retentionMs = settings.messageRetentionMinutes * 60 * 1000;
    const cutoffTimestamp = Date.now() - retentionMs;

    try {
      const deletedCount = await messagesRepo.deleteOlderThan(cutoffTimestamp);
      if (deletedCount > 0) {
        console.log(
          `Message retention: deleted ${deletedCount} messages older than ${settings.messageRetentionMinutes} minutes`,
        );
      }
    } catch (error) {
      console.error("Message retention cleanup failed:", error);
    }
  }, [
    messagesRepo,
    settings.autoDeleteMessages,
    settings.messageRetentionMinutes,
  ]);

  useEffect(() => {
    // Run cleanup immediately on mount and when settings change
    cleanupOldMessages();

    // Set up periodic cleanup
    cleanupIntervalRef.current = setInterval(
      cleanupOldMessages,
      CLEANUP_INTERVAL_MS,
    );

    return () => {
      if (cleanupIntervalRef.current) {
        clearInterval(cleanupIntervalRef.current);
      }
    };
  }, [cleanupOldMessages]);
}
