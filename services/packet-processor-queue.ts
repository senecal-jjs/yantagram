import { BitchatPacket } from "@/types/global";
import { quickHash } from "@/utils/hash";
import { EventEmitter } from "events";
import { randomUUID } from "expo-crypto";

type QueueItem = {
  id: string;
  packet: BitchatPacket;
  timestamp: number;
  retries: number;
};

class PacketProcessorQueue extends EventEmitter {
  private queue: QueueItem[] = [];
  private hashes: number[] = [];
  private processing = false;
  private maxRetries = 3;
  private processingDelay = 50; // ms between packets
  private maxConcurrent = 5;
  private activeProcessing = 0;

  async enqueue(packet: BitchatPacket): Promise<void> {
    const item: QueueItem = {
      id: randomUUID(),
      packet,
      timestamp: Date.now(),
      retries: 0,
    };

    const hash = quickHash(packet.payload);

    if (!this.hashes.includes(hash)) {
      this.hashes.push(hash);
      this.queue.push(item);
      this.emit("enqueued", item);

      if (!this.processing) {
        this.startProcessing();
      }
    }
  }

  private async startProcessing() {
    this.processing = true;

    while (this.queue.length > 0 || this.activeProcessing > 0) {
      // Process up to maxConcurrent items at once
      while (
        this.queue.length > 0 &&
        this.activeProcessing < this.maxConcurrent
      ) {
        const item = this.queue.shift();
        this.hashes.shift();
        if (item) {
          this.processItem(item);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, this.processingDelay));
    }

    this.processing = false;
  }

  private async processItem(item: QueueItem) {
    this.activeProcessing++;

    try {
      this.emit("processing", item);
      // Processor will be set via setProcessor method
      await this.processor?.(item.packet);
      this.emit("processed", item);
    } catch (error) {
      console.error(`Failed to process packet ${item.id}:`, error);

      if (item.retries < this.maxRetries) {
        item.retries++;
        this.queue.push(item); // Re-queue for retry
        this.emit("retrying", item);
      } else {
        this.emit("failed", item, error);
      }
    } finally {
      this.activeProcessing--;
    }
  }

  private processor?: (packet: BitchatPacket) => Promise<void>;

  setProcessor(fn: (packet: BitchatPacket) => Promise<void>) {
    this.processor = fn;
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  clear() {
    this.queue = [];
  }
}

export const packetQueue = new PacketProcessorQueue();
