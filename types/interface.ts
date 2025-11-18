import { Message, Result } from "./global";

interface MessageService {
  sendMessage(message: Message, from: string, to: string): Result;
}

export { MessageService };
