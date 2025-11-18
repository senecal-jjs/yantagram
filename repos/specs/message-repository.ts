import { Message } from "@/types/global";
import { UUID } from "@/types/utility";

export default interface MessageRepository {
  create(message: Message): Promise<Message>;
  get(id: UUID): Promise<Message>;
  getAll(limit: number): Promise<Message[]>;
}
