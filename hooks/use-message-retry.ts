import { serializeEncryptedMessage } from "@/amigo/protocol";
import { useCredentials } from "@/contexts/credential-context";
import {
    OutgoingMessagesRepositoryToken,
    useRepos,
} from "@/contexts/repository-context";
import BleModule from "@/modules/ble/src/BleModule";
import OutgoingMessagesRepository, {
    OutgoingMessage,
} from "@/repos/specs/outgoing-messages-repository";
import { fragmentPayload } from "@/services/frag-service";
import { toBinaryPayload } from "@/services/message-protocol-service";
import { encode } from "@/services/packet-protocol-service";
import { BitchatPacket, FragmentType, PacketType } from "@/types/global";
import { sleep } from "@/utils/sleep";
import Constants from "expo-constants";
import { useCallback, useEffect, useRef } from "react";

/**
 * Build packets for broadcast, fragmenting if necessary
 */
const buildPackets = (
  data: Uint8Array,
  fragmentType: FragmentType,
  packetType: PacketType,
): BitchatPacket[] => {
  if (
    Constants.expoConfig?.extra &&
    data.length >= Constants.expoConfig?.extra.ble.mtuLimitBytes
  ) {
    const { fragments } = fragmentPayload(data, fragmentType);
    return fragments;
  } else {
    return [
      {
        version: 1,
        type: packetType,
        timestamp: Date.now(),
        payload: data,
        allowedHops: 3,
      },
    ];
  }
};

/**
 * Build and broadcast packets
 */
const buildPacketsAndSend = async (
  data: Uint8Array,
  fragmentType: FragmentType,
  packetType: PacketType,
) => {
  const packets = buildPackets(data, fragmentType, packetType);

  for (const packet of packets) {
    const encoded = encode(packet);

    if (!encoded) {
      throw new Error("Failed to encode packet");
    }

    await BleModule.broadcastPacketAsync(encoded, []);
    await sleep(100);
  }
};

/**
 * Hook that handles background retry of undelivered messages.
 * Runs on a configurable interval and re-broadcasts messages that haven't been acknowledged.
 */
// Default retry configuration (fallback values)
const DEFAULT_RETRY_INTERVAL_SECONDS = 30;
const DEFAULT_RETRY_MAX_ATTEMPTS = 10;

export function useMessageRetry() {
  const { member } = useCredentials();
  const { getRepo } = useRepos();
  const outgoingMessagesRepo = getRepo<OutgoingMessagesRepository>(
    OutgoingMessagesRepositoryToken,
  );

  // Get retry configuration from app.json extra.ble
  const retryIntervalSeconds =
    Constants.expoConfig?.extra?.ble?.outgoingMessageRetryIntervalSeconds ??
    DEFAULT_RETRY_INTERVAL_SECONDS;
  const retryMaxAttempts =
    Constants.expoConfig?.extra?.ble?.outgoingMessageRetryMaxAttempts ??
    DEFAULT_RETRY_MAX_ATTEMPTS;

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRetryingRef = useRef(false);

  const retryMessage = useCallback(
    async (message: OutgoingMessage) => {
      if (!member) {
        throw new Error("Member state missing");
      }

      const payload = toBinaryPayload({
        id: message.id,
        groupId: message.groupId,
        sender: message.sender,
        contents: message.contents,
        timestamp: message.timestamp,
      });

      if (!payload) {
        throw new Error("Failed to encode message to binary payload");
      }

      const encryptedPayload = await member.encryptApplicationMessage(
        payload,
        message.groupId,
      );

      const encryptedBytes = serializeEncryptedMessage(encryptedPayload);

      await buildPacketsAndSend(
        encryptedBytes,
        FragmentType.MESSAGE,
        PacketType.MESSAGE,
      );
    },
    [member],
  );

  const retryMessages = useCallback(async () => {
    if (!member) {
      return;
    }

    // Prevent overlapping retry cycles
    if (isRetryingRef.current) {
      console.log(
        "[MessageRetry] Previous retry cycle still in progress, skipping",
      );
      return;
    }

    isRetryingRef.current = true;

    try {
      const intervalMs = retryIntervalSeconds * 1000;
      const maxRetries = retryMaxAttempts;

      const messagesToRetry = await outgoingMessagesRepo.getMessagesForRetry(
        intervalMs,
        maxRetries,
      );

      if (messagesToRetry.length === 0) {
        return;
      }

      console.log(
        `[MessageRetry] Found ${messagesToRetry.length} messages to retry`,
      );

      for (const message of messagesToRetry) {
        try {
          await retryMessage(message);
          await outgoingMessagesRepo.updateRetryInfo(message.id);
          console.log(
            `[MessageRetry] Retried message ${message.id} (attempt ${message.retryCount + 1}/${maxRetries})`,
          );
        } catch (error) {
          console.error(
            `[MessageRetry] Failed to retry message ${message.id}:`,
            error,
          );
        }

        // Small delay between retries to avoid flooding
        await sleep(100);
      }
    } catch (error) {
      console.error("[MessageRetry] Error during retry cycle:", error);
    } finally {
      isRetryingRef.current = false;
    }
  }, [
    member,
    outgoingMessagesRepo,
    retryIntervalSeconds,
    retryMaxAttempts,
    retryMessage,
  ]);

  // Set up the retry interval
  useEffect(() => {
    if (!member) {
      return;
    }

    const intervalMs = retryIntervalSeconds * 1000;

    console.log(
      `[MessageRetry] Starting retry service with ${retryIntervalSeconds}s interval`,
    );

    // Clear existing interval if any
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Run immediately on mount (after a small delay to let things settle)
    const timeoutId = setTimeout(() => {
      retryMessages();
    }, 5000);

    // Set up recurring interval
    intervalRef.current = setInterval(() => {
      retryMessages();
    }, intervalMs);

    return () => {
      clearTimeout(timeoutId);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [member, retryIntervalSeconds, retryMessages]);

  return {
    /**
     * Manually trigger a retry cycle.
     */
    triggerRetry: retryMessages,
  };
}
