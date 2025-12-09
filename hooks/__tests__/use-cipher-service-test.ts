test.skip("encrypt & decrypt", async () => {
  // const { result: resultAlice } = renderHook(() => useCipherService());
  // // create separate state for Bob
  // const { result: resultBob } = renderHook(() => useCipherService());
  // const message: Message = {
  //   id: "1",
  //   sender: "2",
  //   contents: "Hello!",
  //   timestamp: Date.now(),
  //   isRelay: false,
  //   originalSender: null,
  //   isPrivate: true,
  //   recipientNickname: "@ace",
  //   senderPeerId: "p2",
  //   deliveryStatus: DeliveryStatus.SENDING,
  // };
  // const messageBytes = toBinaryPayload(message)!;
  // // Create Bob's key package
  // const bobPeerId = "3";
  // let bobKeyPkg;
  // act(async () => {
  //   const bobCredential = resultBob.current.getPeerCredential(bobPeerId);
  //   bobKeyPkg = await resultBob.current.getKeyPackage(bobCredential);
  // });
  // act(async () => {
  //   // Alice starts group
  //   const group = await resultAlice.current.startGroup("2", null);
  //   // Alice adds Bob to the group
  //   const bobWelcome = await resultAlice.current.addPeer(
  //     group.groupId,
  //     bobKeyPkg!.publicPackage,
  //   );
  //   // Bob joins group on his device
  //   await resultBob.current.joinExistingGroup(
  //     group.groupId,
  //     bobWelcome,
  //     bobKeyPkg!,
  //   );
  //   // Alice encrypts message
  //   const encryptedMsg = await resultAlice.current.encryptMessage(
  //     group.groupId,
  //     messageBytes,
  //   );
  //   // Bob decrypts message
  //   const decryptedMsg = await resultBob.current.decryptMessage(
  //     group.groupId,
  //     encryptedMsg,
  //   );
  //   console.log(fromBinaryPayload(decryptedMsg));
  // });
});
