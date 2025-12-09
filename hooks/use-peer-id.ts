import { secureStore } from "@/utils/secure-store";
import { useState } from "react";

export function usePeerId(): {
  peerId: string | null;
  setPeerId: (id: string) => Promise<void>;
} {
  const [peerId, setPeerIdState] = useState<string | null>(null);

  const setPeerId = async (id: string) => {
    await secureStore("peerId", id);
    setPeerIdState(id);
  };

  return { peerId, setPeerId };
}
