import { Message } from "./global";

interface MessageService {
  sendMessage(message: Message): void;
}

export { MessageService };
