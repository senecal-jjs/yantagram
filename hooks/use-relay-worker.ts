import {
  RelayPacketsRepositoryToken,
  useRepos,
} from "@/contexts/repository-context";
import BleModule from "@/modules/ble";
import RelayPacketsRepository from "@/repos/specs/relay-packets-repository";
import { encode } from "@/services/packet-protocol-service";
import { sleep } from "@/utils/sleep";
import { useEffect, useRef } from "react";

const RELAY_INTERVAL_MS = 2000; // Process relay queue every 2 seconds
const RELAY_DELAY_MS = 150; // Delay between individual packet broadcasts

/**
 * Background worker that processes the relay packets queue.
 *
 * This hook implements a flooding protocol by:
 * 1. Retrieving the earliest packet from the relay queue
 * 2. Decrementing the allowedHops (TTL) counter
 * 3. Rebroadcasting the packet to all connected devices except the originator
 * 4. Deleting the packet from the queue after processing
 *
 * Packets with allowedHops <= 0 are removed without rebroadcasting.
 */
export function useRelayWorker() {
  const { getRepo } = useRepos();
  const relayPacketsRepo = getRepo<RelayPacketsRepository>(
    RelayPacketsRepositoryToken,
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    const processRelayQueue = async () => {
      // Prevent concurrent processing
      if (isProcessingRef.current) {
        return;
      }

      // Schedule high-impact work during idle time
      const requestIdleCallback =
        global.requestIdleCallback || ((cb) => setTimeout(cb, 1));

      requestIdleCallback(async () => {
        isProcessingRef.current = true;

        try {
          const relayEntry = await relayPacketsRepo.getEarliest();

          if (!relayEntry) {
            return;
          }

          const { id, packet, deviceUUID } = relayEntry;

          // Check if packet should still be relayed
          if (packet.allowedHops <= 0) {
            console.log(
              `[Relay] Packet ${id} expired (hops: ${packet.allowedHops}), removing`,
            );
            await relayPacketsRepo.delete(id);
            return;
          }

          // Decrement hops
          const newHops = packet.allowedHops - 1;
          const updatedPacket = {
            ...packet,
            allowedHops: newHops,
          };

          console.log(
            `[Relay] Rebroadcasting packet ${id} (type: ${packet.type}, hops: ${packet.allowedHops} → ${newHops})`,
          );

          try {
            // Encode the packet with decremented hops
            const encoded = encode(updatedPacket);

            if (!encoded) {
              console.error(`[Relay] Failed to encode packet ${id}`);
              await relayPacketsRepo.delete(id);
              return;
            }

            // Broadcast to all devices EXCEPT the device that sent us this packet
            // This prevents packets from bouncing back to their sender
            await BleModule.broadcastPacketAsync(encoded, [deviceUUID]);

            console.log(`[Relay] Successfully relayed packet ${id}`);

            // Add delay to avoid flooding the network
            await sleep(RELAY_DELAY_MS);
          } catch (error) {
            console.error(`[Relay] Failed to broadcast packet ${id}:`, error);
          } finally {
            // Always delete after attempting to relay
            // If broadcast failed, packet is lost (eventual consistency)
            await relayPacketsRepo.delete(id);
          }
        } catch (error) {
          console.error("[Relay] Error processing relay queue:", error);
        } finally {
          isProcessingRef.current = false;
        }
      });
    };

    // Start the relay worker
    console.log("[Relay] Starting relay worker");
    intervalRef.current = setInterval(processRelayQueue, RELAY_INTERVAL_MS);

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        console.log("[Relay] Stopping relay worker");
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [relayPacketsRepo]);
}
