import { Message, Result } from "./global";

interface MessageService {
  sendMessage(message: Message, from: string, to: string): Result;
  encodeMessage(message: Message, from: string, to: string): Uint8Array;
}

export { MessageService };
