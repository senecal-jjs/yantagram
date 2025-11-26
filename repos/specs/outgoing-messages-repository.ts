import { Message } from "@/types/global";

export default interface OutgoingMessagesRepository {
  create(message: Message): Promise<Message>;
  delete(messageId: string): Promise<Message | null>;
  getAll(): Promise<Message[]>;
  exists(messageId: string): Promise<boolean>;
}
