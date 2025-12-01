import * as Crypto from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import {
  CiphersuiteImpl,
  ClientState,
  createApplicationMessage,
  createCommit,
  CreateCommitResult,
  createGroup,
  Credential,
  decodeMlsMessage,
  defaultCapabilities,
  defaultLifetime,
  emptyPskIndex,
  encodeMlsMessage,
  generateKeyPackage,
  getCiphersuiteFromName,
  getCiphersuiteImpl,
  joinGroup,
  KeyPackage,
  PrivateKeyPackage,
  PrivateMessage,
  processPrivateMessage,
  Proposal,
  Welcome,
} from "ts-mls";
import { MLSMessage } from "ts-mls/message.js";

type MLSKeyPackage = {
  publicPackage: KeyPackage;
  privatePackage: PrivateKeyPackage;
};

export function useCipherService() {
  // Load the ciphersuite implementation in a React effect
  const implRef = useRef<CiphersuiteImpl | null>(null);
  const implWaiters = useRef<((impl: CiphersuiteImpl) => void)[]>([]);

  const ensureImpl = async (): Promise<CiphersuiteImpl> => {
    if (implRef.current) return implRef.current;
    return new Promise((resolve) => {
      implWaiters.current.push(resolve);
    });
  };

  useEffect(() => {
    let mounted = true;
    const loadImpl = async () => {
      const implementation = await getCiphersuiteImpl(
        getCiphersuiteFromName("MLS_256_XWING_AES256GCM_SHA512_Ed25519"),
      );
      if (!mounted) return;
      implRef.current = implementation;
      // Resolve any waiters
      implWaiters.current.forEach((fn) => fn(implementation));
      implWaiters.current = [];
    };
    loadImpl();
    return () => {
      mounted = false;
    };
  }, []);

  // map of group id to MLS client state
  const [clientState, setClientState] = useState<Map<string, ClientState>>(
    new Map(),
  );

  const updateClientState = (groupId: string, clientState: ClientState) => {
    setClientState((prevMap) => {
      const newMap = new Map(prevMap);
      newMap.set(groupId, clientState);
      return newMap;
    });
  };

  const getPeerCredential = (peerId: string): Credential => {
    return {
      credentialType: "basic",
      identity: new TextEncoder().encode(peerId),
    };
  };

  const getKeyPackage = async (
    credential: Credential,
  ): Promise<MLSKeyPackage> => {
    const impl = await ensureImpl();
    return await generateKeyPackage(
      credential,
      defaultCapabilities(),
      defaultLifetime,
      [],
      impl,
    );
  };

  const constructGroup = async (
    groupId: string,
    initialKeyPackage: MLSKeyPackage,
  ): Promise<ClientState> => {
    const id = new TextEncoder().encode(groupId);
    const impl = await ensureImpl();
    return await createGroup(
      id,
      initialKeyPackage.publicPackage,
      initialKeyPackage.privatePackage,
      [],
      impl,
    );
  };

  const getAddMemberProposal = (
    memberToAddKeyPackage: KeyPackage,
  ): Proposal => {
    return {
      proposalType: "add",
      add: { keyPackage: memberToAddKeyPackage },
    };
  };

  const commitProposal = async (
    group: ClientState,
    proposal: Proposal,
  ): Promise<CreateCommitResult> => {
    const impl = await ensureImpl();
    return await createCommit(
      { state: group, cipherSuite: impl },
      {
        extraProposals: [proposal],
        ratchetTreeExtension: true,
      },
    );
  };

  const joinExistingGroup = async (
    welcome: Welcome,
    outsiderKeyPackage: MLSKeyPackage,
  ): Promise<ClientState> => {
    const impl = await ensureImpl();
    return await joinGroup(
      welcome,
      outsiderKeyPackage.publicPackage,
      outsiderKeyPackage.privatePackage,
      emptyPskIndex,
      impl,
    );
  };

  const addPeer = async (
    groupId: string,
    peerToAdd: KeyPackage,
  ): Promise<Welcome> => {
    const peerToAddProposal = getAddMemberProposal(peerToAdd);
    const commitResult = await commitProposal(
      clientState.get(groupId)!,
      peerToAddProposal,
    );

    if (!commitResult.welcome)
      throw new Error("Failed to constuct Welcome when starting group!");

    updateClientState(groupId, commitResult.newState);

    return commitResult.welcome;
  };

  const startGroup = async (
    peerId: string,
    groupId: string | null,
  ): Promise<{ groupId: string }> => {
    const credential = getPeerCredential(peerId);
    const keyPkg = await getKeyPackage(credential);
    const resolvedGroupId = groupId ? groupId : Crypto.randomUUID();
    const group = await constructGroup(resolvedGroupId, keyPkg);

    updateClientState(resolvedGroupId, group);

    return {
      groupId: resolvedGroupId,
    };
  };

  const encodeMLSMessage = (
    wireFormat: string,
    payload: Welcome | KeyPackage | PrivateMessage,
  ): Uint8Array | undefined => {
    switch (wireFormat) {
      case "mls_welcome":
        return encodeMlsMessage({
          welcome: payload as Welcome,
          wireformat: "mls_welcome",
          version: "mls10",
        });
      case "mls_key_package":
        return encodeMlsMessage({
          keyPackage: payload as KeyPackage,
          wireformat: "mls_key_package",
          version: "mls10",
        });
      case "mls_private_messsage":
        return encodeMlsMessage({
          privateMessage: payload as PrivateMessage,
          wireformat: "mls_private_message",
          version: "mls10",
        });
      default:
        console.warn("Unsupported wire format");
        break;
    }
  };

  const decodeMLSMessage = (
    wireFormat: string,
    payload: Uint8Array,
  ): MLSMessage => {
    return decodeMlsMessage(payload, 0)![0];
  };

  const encryptMessage = async (
    groupId: string,
    contents: Uint8Array,
  ): Promise<PrivateMessage> => {
    const impl = await ensureImpl();
    const messageResult = await createApplicationMessage(
      clientState.get(groupId)!,
      contents,
      impl,
    );

    updateClientState(groupId, messageResult.newState);

    return messageResult.privateMessage;
  };

  const decryptMessage = async (
    groupId: string,
    message: PrivateMessage,
  ): Promise<Uint8Array> => {
    const impl = await ensureImpl();
    const processMsgResult = await processPrivateMessage(
      clientState.get(groupId)!,
      message,
      emptyPskIndex,
      impl,
    );

    updateClientState(groupId, processMsgResult.newState);

    if (processMsgResult.kind === "newState") {
      throw new Error("Expected application message");
    }

    return processMsgResult.message;
  };

  return {
    encryptMessage,
    decryptMessage,
    startGroup,
    joinExistingGroup,
    encodeMLSMessage,
    decodeMLSMessage,
    getPeerCredential,
    getKeyPackage,
    addPeer,
  };
}
