import { useCredentials } from "@/contexts/credential-context";
import {
  PendingDeliveryAcksRepositoryToken,
  useRepos,
} from "@/contexts/repository-context";
import BleModule from "@/modules/ble/src/BleModule";
import PendingDeliveryAcksRepository from "@/repos/specs/pending-delivery-acks-repository";
import {
  encode,
  serializeDeliveryAck,
} from "@/services/packet-protocol-service";
import { BitchatPacket, PacketType } from "@/types/global";
import { sleep } from "@/utils/sleep";
import { uint8ArrayToHexString } from "@/utils/string";
import { useCallback, useEffect, useRef } from "react";

const ACK_RETRY_INTERVAL_SECONDS = 60;
const ACK_RETRY_MAX_AGE_SECONDS = 24 * 60 * 60;

export function useDeliveryAckRetry() {
  const { member } = useCredentials();
  const { getRepo } = useRepos();
  const pendingDeliveryAcksRepo = getRepo<PendingDeliveryAcksRepository>(
    PendingDeliveryAcksRepositoryToken,
  );

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRetryingRef = useRef(false);

  const retryAcks = useCallback(async () => {
    if (!member) {
      return;
    }

    if (isRetryingRef.current) {
      return;
    }

    isRetryingRef.current = true;

    try {
      const intervalMs = ACK_RETRY_INTERVAL_SECONDS * 1000;
      const maxAgeMs = ACK_RETRY_MAX_AGE_SECONDS * 1000;
      const myVerificationKey = uint8ArrayToHexString(
        member.credential.verificationKey,
      );

      const pendingAcks = await pendingDeliveryAcksRepo.getForRetry(
        intervalMs,
        maxAgeMs,
      );

      if (pendingAcks.length === 0) {
        return;
      }

      for (const pending of pendingAcks) {
        if (pending.recipientVerificationKey !== myVerificationKey) {
          await pendingDeliveryAcksRepo.delete(pending.messageId);
          continue;
        }

        try {
          const ackPayload = serializeDeliveryAck({
            messageId: pending.messageId,
            senderVerificationKey: myVerificationKey,
            timestamp: Date.now(),
          });

          const packet: BitchatPacket = {
            version: 1,
            type: PacketType.DELIVERY_ACK,
            timestamp: Date.now(),
            payload: ackPayload,
            allowedHops: 3,
          };

          const encoded = encode(packet);

          if (!encoded) {
            throw new Error("Failed to encode delivery ACK packet");
          }

          await BleModule.broadcastPacketAsync(encoded, []);
          await pendingDeliveryAcksRepo.updateRetryInfo(pending.messageId);
        } catch (error) {
          console.error(
            `[DeliveryAckRetry] Failed to retry ACK ${pending.messageId}:`,
            error,
          );
        }

        await sleep(100);
      }

      await pendingDeliveryAcksRepo.deleteExpired(maxAgeMs);
    } catch (error) {
      console.error("[DeliveryAckRetry] Error during retry cycle:", error);
    } finally {
      isRetryingRef.current = false;
    }
  }, [member, pendingDeliveryAcksRepo]);

  useEffect(() => {
    if (!member) {
      return;
    }

    const intervalMs = ACK_RETRY_INTERVAL_SECONDS * 1000;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    const timeoutId = setTimeout(() => {
      retryAcks();
    }, 5000);

    intervalRef.current = setInterval(() => {
      retryAcks();
    }, intervalMs);

    return () => {
      clearTimeout(timeoutId);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [member, retryAcks]);

  return { triggerRetry: retryAcks };
}
