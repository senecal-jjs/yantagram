import {
  ConnectedDevicesRepositoryToken,
  RelayPacketsRepositoryToken,
  useRepos,
} from "@/contexts/repository-context";
import BleModule from "@/modules/ble";
import ConnectedDevicesRepository, {
  ConnectedDevice,
} from "@/repos/specs/connected-devices-repository";
import RelayPacketsRepository from "@/repos/specs/relay-packets-repository";
import { encode } from "@/services/packet-protocol-service";
import { quickHashHex } from "@/utils/hash";
import { sleep } from "@/utils/sleep";
import { useEffect, useRef } from "react";

const RELAY_INTERVAL_MS = 2000; // Process relay queue every 2 seconds
const RELAY_DELAY_MS = 150; // Delay between individual packet broadcasts

/**
 * Calculate subset size for K-of-N fanout.
 * Uses logarithmic scaling: K ≈ ceil(log2(N)) + 1
 * This provides good coverage while reducing redundant broadcasts.
 */
function subsetSizeForFanout(n: number): number {
  if (n <= 0) return 0;
  if (n <= 2) return n; // Small networks: send to all
  // approx ceil(log2(n)) + 1
  const bits = Math.ceil(Math.log2(n));
  return Math.min(n, Math.max(1, bits + 1));
}

/**
 * Select a deterministic subset of K devices from N available.
 * Uses hash(seed + deviceUUID) for stable, reproducible selection.
 * Same packet will select same subset across all nodes with same peers.
 */
function selectDeterministicSubset(
  devices: ConnectedDevice[],
  k: number,
  seed: string,
): ConnectedDevice[] {
  if (k <= 0) return [];
  if (devices.length <= k) return devices;

  // Score each device by hash(seed :: deviceUUID)
  const scored: { device: ConnectedDevice; score: string }[] = [];
  for (const device of devices) {
    const msg = `${seed}::${device.deviceUUID}`;
    const encoder = new TextEncoder();
    const digest = quickHashHex(encoder.encode(msg));
    scored.push({ device, score: digest });
  }

  // Sort by hash (lexicographic), take top K
  scored.sort((a, b) => a.score.localeCompare(b.score));
  return scored.slice(0, k).map((s) => s.device);
}

/**
 * Background worker that processes the relay packets queue.
 *
 * This hook implements a flooding protocol with K-of-N fanout optimization:
 * 1. Retrieving the earliest packet from the relay queue
 * 2. Decrementing the allowedHops (TTL) counter
 * 3. Selecting K of N connected devices using deterministic subset selection
 * 4. Rebroadcasting the packet to selected devices (excluding originator)
 * 5. Deleting the packet from the queue after processing
 *
 * K-of-N fanout reduces redundant broadcasts while maintaining high delivery
 * probability. K scales logarithmically with N (e.g., 4 of 8, 5 of 16).
 *
 * Packets with allowedHops <= 0 are removed without rebroadcasting.
 */
export function useRelayWorker() {
  const { getRepo } = useRepos();
  const relayPacketsRepo = getRepo<RelayPacketsRepository>(
    RelayPacketsRepositoryToken,
  );
  const connectedDevicesRepo = getRepo<ConnectedDevicesRepository>(
    ConnectedDevicesRepositoryToken,
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
          // Get earliest unrelayed packet
          const relayEntry = await relayPacketsRepo.getEarliestUnrelayed();

          if (!relayEntry) {
            return;
          }

          const { id, packet, deviceUUID } = relayEntry;

          // Check if packet should still be relayed
          if (packet.allowedHops <= 0) {
            console.log(
              `[Relay] Packet ${id} expired (hops: ${packet.allowedHops}), marking as relayed`,
            );
            await relayPacketsRepo.markRelayed(id);
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
              await relayPacketsRepo.markRelayed(id);
              return;
            }

            // Get all connected devices (excluding the sender)
            const allConnected = await connectedDevicesRepo.getAllConnected();
            const eligibleDevices = allConnected.filter(
              (d) => d.deviceUUID !== deviceUUID,
            );

            if (eligibleDevices.length === 0) {
              console.log(`[Relay] No eligible devices for packet ${id}`);
              return;
            }

            // Apply K-of-N fanout: select logarithmic subset of devices
            const k = subsetSizeForFanout(eligibleDevices.length);

            // Create deterministic seed from packet content for consistent selection
            // Using type, timestamp, and payload hash ensures same packet selects same subset
            const payloadHash = quickHashHex(packet.payload);
            const seed = `${packet.type}-${packet.timestamp}-${payloadHash}`;
            const selectedDevices = selectDeterministicSubset(
              eligibleDevices,
              k,
              seed,
            );

            // Build blackout list: all devices NOT in selected subset + original sender
            const selectedUUIDs = new Set(
              selectedDevices.map((d) => d.deviceUUID),
            );
            const blackoutUUIDs = allConnected
              .filter((d) => !selectedUUIDs.has(d.deviceUUID))
              .map((d) => d.deviceUUID);
            blackoutUUIDs.push(deviceUUID); // Always exclude original sender

            console.log(
              `[Relay] K-of-N fanout: ${selectedDevices.length}/${eligibleDevices.length} devices selected`,
            );

            // Broadcast to selected subset only
            await BleModule.broadcastPacketAsync(encoded, blackoutUUIDs);

            console.log(`[Relay] Successfully relayed packet ${id}`);

            // Add delay to avoid flooding the network
            await sleep(RELAY_DELAY_MS);
          } catch (error) {
            console.error(`[Relay] Failed to broadcast packet ${id}:`, error);
          } finally {
            // Mark packet as relayed (FIFO eviction handles cleanup)
            await relayPacketsRepo.markRelayed(id);
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
  }, [relayPacketsRepo, connectedDevicesRepo]);
}
