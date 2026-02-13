import {
  OutgoingAmigoMessagesRepositoryToken,
  useRepos,
} from "@/contexts/repository-context";
import BleModule from "@/modules/ble/src/BleModule";
import OutgoingAmigoMessagesRepository from "@/repos/specs/outgoing-amigo-messages-repository";
import { fragmentPayload } from "@/services/frag-service";
import { encode } from "@/services/packet-protocol-service";
import { BitchatPacket, FragmentType, PacketType } from "@/types/global";
import { sleep } from "@/utils/sleep";
import Constants from "expo-constants";
import { useCallback, useEffect, useRef } from "react";

const DEFAULT_RETRY_INTERVAL_SECONDS = 30;
const DEFAULT_RETRY_MAX_ATTEMPTS = 10;

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
  }

  return [
    {
      version: 1,
      type: packetType,
      timestamp: Date.now(),
      payload: data,
      allowedHops: 3,
    },
  ];
};

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

export function useAmigoRetry() {
  const { getRepo } = useRepos();
  const outgoingAmigoMessagesRepo = getRepo<OutgoingAmigoMessagesRepository>(
    OutgoingAmigoMessagesRepositoryToken,
  );

  const outgoingIntervalSeconds =
    Constants.expoConfig?.extra?.ble?.outgoingMessageRetryIntervalSeconds ??
    DEFAULT_RETRY_INTERVAL_SECONDS;
  const outgoingMaxAttempts =
    Constants.expoConfig?.extra?.ble?.outgoingMessageRetryMaxAttempts ??
    DEFAULT_RETRY_MAX_ATTEMPTS;

  const retryIntervalSeconds =
    Constants.expoConfig?.extra?.ble?.amigoMessageRetryIntervalSeconds ??
    outgoingIntervalSeconds;
  const retryMaxAttempts =
    Constants.expoConfig?.extra?.ble?.amigoMessageRetryMaxAttempts ??
    outgoingMaxAttempts;

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRetryingRef = useRef(false);

  const retryMessages = useCallback(async () => {
    if (isRetryingRef.current) {
      return;
    }

    isRetryingRef.current = true;

    try {
      const intervalMs = retryIntervalSeconds * 1000;
      const messagesToRetry =
        await outgoingAmigoMessagesRepo.getMessagesForRetry(
          intervalMs,
          retryMaxAttempts,
        );

      if (messagesToRetry.length === 0) {
        return;
      }

      for (const message of messagesToRetry) {
        try {
          const payload = Buffer.from(message.payloadBase64, "base64");
          const fragmentType =
            message.packetType === PacketType.AMIGO_PATH_UPDATE
              ? FragmentType.AMIGO_PATH_UPDATE
              : FragmentType.AMIGO_WELCOME;

          await buildPacketsAndSend(payload, fragmentType, message.packetType);
          await outgoingAmigoMessagesRepo.updateRetryInfo(message.id);
        } catch (error) {
          console.error(
            `[AmigoRetry] Failed to retry amigo message ${message.id}:`,
            error,
          );
        }

        await sleep(100);
      }
    } catch (error) {
      console.error("[AmigoRetry] Error during retry cycle:", error);
    } finally {
      isRetryingRef.current = false;
    }
  }, [outgoingAmigoMessagesRepo, retryIntervalSeconds, retryMaxAttempts]);

  useEffect(() => {
    const intervalMs = retryIntervalSeconds * 1000;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    const timeoutId = setTimeout(() => {
      retryMessages();
    }, 5000);

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
  }, [retryIntervalSeconds, retryMessages]);

  return { triggerRetry: retryMessages };
}
