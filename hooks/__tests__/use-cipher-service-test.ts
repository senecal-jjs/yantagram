import {
    fromBinaryPayload,
    toBinaryPayload,
} from "@/services/message-protocol-service";
import { DeliveryStatus, Message } from "@/types/global";
import { act, renderHook } from "@testing-library/react-native";
import { Welcome } from "ts-mls";
import { useCipherService } from "../use-cipher-service";

test("encrypt & decrypt", async () => {
  const { result: resultAlice } = renderHook(() => useCipherService());

  // create separate state for Bob
  const { result: resultBob } = renderHook(() => useCipherService());

  const message: Message = {
    id: "1",
    sender: "2",
    contents: "Hello!",
    timestamp: Date.now(),
    isRelay: false,
    originalSender: null,
    isPrivate: true,
    recipientNickname: "@ace",
    senderPeerId: "p2",
    deliveryStatus: DeliveryStatus.SENDING,
  };

  const messageBytes = toBinaryPayload(message)!;

  // Create Bob's key package
  const bobPeerId = "3";
  let bobKeyPkg;
  act(async () => {
    const bobCredential = resultBob.current.getPeerCredential(bobPeerId);
    bobKeyPkg = await resultBob.current.getKeyPackage(bobCredential);
  });

  // Alice starts group
  let group: { groupId: string };
  act(async () => {
    group = await resultAlice.current.startGroup("2", null);
  });

  // Alice adds Bob to the group
  let bobWelcome: Welcome;
  act(async () => {
    bobWelcome = await resultAlice.current.addPeer(
      group.groupId,
      bobKeyPkg!.publicPackage,
    );
  });

  // Bob joins group on his device
  act(async () => {
    await resultBob.current.joinExistingGroup(bobWelcome, bobKeyPkg!);
  });

  // Alice encrypts message
  const encryptedMsg = await resultAlice.current.encryptMessage(
    group.groupId,
    messageBytes,
  );

  // Bob decrypts message
  const decryptedMsg = await resultBob.current.decryptMessage(
    group.groupId,
    encryptedMsg,
  );

  console.log(fromBinaryPayload(decryptedMsg));
});
