import { Member } from "@/amigo/member";
import { Credentials } from "@/amigo/types";
import {
  deleteFile,
  fetchEncryptedFromFile,
  fileExists,
  recoverTmpFile,
  saveEncryptedAtomic,
} from "@/utils/file";
import { generateRandomName } from "@/utils/names";
import {
  removeSecureStore,
  secureFetch,
  secureKeyExists,
  secureStore,
} from "@/utils/secure-store";
import { getRandomBytes } from "expo-crypto";
import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

const MEMBER_STATE_FILENAME = "member_state.enc";
const ENCRYPTION_KEY_STORE_KEY = "member_encryption_key";

interface CredentialContextType {
  member: Member | null;
  credentials: Credentials | null;
  isLoading: boolean;
  loadError: string | null;
  pseudonym: string | null;
  updatePseudonym: (newPseudonym: string) => Promise<void>;
  regenerateMember: (pseudonym: string) => Promise<void>;
  saveMember: () => Promise<void>;
  deleteMember: () => Promise<void>;
}

const CredentialContext = createContext<CredentialContextType | undefined>(
  undefined,
);

export const CredentialProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [member, setMember] = useState<Member | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [pseudonym, setPseudonym] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const initializeMember = async () => {
    try {
      setIsLoading(true);
      setLoadError(null);

      // Recover from an interrupted atomic write (crash between delete + move)
      recoverTmpFile(MEMBER_STATE_FILENAME);

      // --- Mitigation 1: check existence BEFORE attempting decryption ---
      const hasEncryptionKey = await secureKeyExists(ENCRYPTION_KEY_STORE_KEY);
      const hasFile = fileExists(MEMBER_STATE_FILENAME);

      if (!hasEncryptionKey && !hasFile) {
        // First launch — no credentials exist, create new member
        console.log("No member state found, creating new member");
        await generateNewMember(generateRandomName());
        return;
      }

      if (!hasEncryptionKey || !hasFile) {
        // Partial state — one artifact exists but not the other
        if (hasEncryptionKey) {
          removeSecureStore(ENCRYPTION_KEY_STORE_KEY);
        } else if (hasFile) {
          deleteFile(MEMBER_STATE_FILENAME);
        }
        const missing = !hasEncryptionKey ? "encryption key" : "member file";
        console.log(
          `Inconsistent credential state: missing ${missing}. ` +
            `Use "Reset Identity" in settings to start fresh.`,
        );
        await generateNewMember(generateRandomName());
        return;
      }

      // Both exist — attempt to load
      const encryptionKeyBase64 = await secureFetch(ENCRYPTION_KEY_STORE_KEY);
      const encryptionKey = Buffer.from(encryptionKeyBase64, "base64");

      const storedMemberState = await fetchEncryptedFromFile(
        MEMBER_STATE_FILENAME,
        encryptionKey,
      );

      const loadedMember = Member.fromJSON(JSON.parse(storedMemberState));
      console.log("Loaded member: ", loadedMember.credential.ecdhPublicKey);

      setMember(loadedMember);
      setCredentials(loadedMember.credential);
      setPseudonym(loadedMember.pseudonym);
    } catch (error) {
      // Surface the error instead of silently regenerating
      const message =
        error instanceof Error ? error.message : "Failed to load credentials";
      console.error("Failed to load credentials:", message);
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  };
  /**
   * Load member from encrypted file or create new one
   */
  useEffect(() => {
    initializeMember();
  }, []);

  /**
   * Generate new member and store in encrypted file
   */
  const generateNewMember = async (newPseudonym: string) => {
    try {
      setIsLoading(true);

      const newMember = await Member.create(newPseudonym);

      // Generate encryption key (256-bit for AES-256)
      const encryptionKey = getRandomBytes(32);

      // Serialize and save with embedded nonce + atomic write
      const serialized = newMember.toJSON();
      await saveEncryptedAtomic(
        JSON.stringify(serialized),
        MEMBER_STATE_FILENAME,
        encryptionKey,
      );

      // Store encryption key in secure store
      await secureStore(
        ENCRYPTION_KEY_STORE_KEY,
        Buffer.from(encryptionKey).toString("base64"),
      );

      setMember(newMember);
      setCredentials(newMember.credential);
      setPseudonym(newPseudonym);
    } catch (error) {
      console.error("Failed to generate member:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Update pseudonym and regenerate signature
   */
  const updatePseudonym = async (newPseudonym: string) => {
    try {
      setIsLoading(true);

      if (!member) {
        throw new Error("No member loaded");
      }

      // Update member pseudonym
      member.pseudonym = newPseudonym;

      // Update credential with new signature
      const signature = member.signingKey;
      member.credential = {
        verificationKey: member.credential.verificationKey,
        pseudonym: newPseudonym,
        signature: signature,
        ecdhPublicKey: member.credential.ecdhPublicKey,
      };

      // Save updated member state to encrypted file
      await saveMember();

      setCredentials(member.credential);
      setPseudonym(newPseudonym);
    } catch (error) {
      console.error("Failed to update pseudonym:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Regenerate entire member (new keys)
   */
  const regenerateMember = async (newPseudonym: string) => {
    await generateNewMember(newPseudonym);
  };

  /**
   * Save current member state to encrypted file
   */
  const saveMember = async () => {
    if (!member) {
      throw new Error("No member to save");
    }

    try {
      // Load encryption key from secure store
      const encryptionKeyBase64 = await secureFetch(ENCRYPTION_KEY_STORE_KEY);
      const encryptionKey = Buffer.from(encryptionKeyBase64, "base64");

      // Atomic write with embedded nonce — no delete-before-write gap
      const serialized = member.toJSON();
      await saveEncryptedAtomic(
        JSON.stringify(serialized),
        MEMBER_STATE_FILENAME,
        encryptionKey,
      );
    } catch (error) {
      console.error("Failed to save member:", error);
      throw error;
    }
  };

  const deleteMember = async () => {
    // Clean up all credential artifacts
    const { File, Paths } = await import("expo-file-system");

    const memberFile = new File(Paths.document, MEMBER_STATE_FILENAME);
    if (memberFile.exists) memberFile.delete();

    const tmpFile = new File(Paths.document, `${MEMBER_STATE_FILENAME}.tmp`);
    if (tmpFile.exists) tmpFile.delete();

    const { removeSecureStore } = await import("@/utils/secure-store");
    await removeSecureStore(ENCRYPTION_KEY_STORE_KEY);

    // Re-initialize (will create a fresh member since nothing exists)
    await initializeMember();
  };

  const value: CredentialContextType = {
    member,
    credentials,
    isLoading,
    loadError,
    pseudonym,
    updatePseudonym,
    regenerateMember,
    saveMember,
    deleteMember,
  };

  return (
    <CredentialContext.Provider value={value}>
      {children}
    </CredentialContext.Provider>
  );
};

/**
 * Hook to access credential context
 */
export const useCredentials = (): CredentialContextType => {
  const context = useContext(CredentialContext);
  if (!context) {
    throw new Error("useCredentials must be used within a CredentialProvider");
  }
  return context;
};

/**
 * Alias for useCredentials (singular form)
 */
export const useCredential = useCredentials;
