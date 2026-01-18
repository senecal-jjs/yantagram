import { Member } from "@/amigo/member";
import { Credentials } from "@/amigo/types";
import { fetchFromFile, saveToAppDirectory } from "@/utils/file";
import { generateRandomName } from "@/utils/names";
import { secureFetch, secureStore } from "@/utils/secure-store";
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
const NONCE_STORE_KEY = "member_nonce";

interface CredentialContextType {
  member: Member | null;
  credentials: Credentials | null;
  isLoading: boolean;
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
  const initializeMember = async () => {
    try {
      setIsLoading(true);

      // TEMPORARY FOR TESTING
      // deleteFile(MEMBER_STATE_FILENAME);

      // Try to load encryption key and nonce from secure store
      const encryptionKeyBase64 = await secureFetch(ENCRYPTION_KEY_STORE_KEY);
      const nonceBase64 = await secureFetch(NONCE_STORE_KEY);

      const encryptionKey = Buffer.from(encryptionKeyBase64, "base64");
      const nonce = { data: Buffer.from(nonceBase64, "base64") };

      // Load encrypted member state from file
      const storedMemberState = await fetchFromFile(
        MEMBER_STATE_FILENAME,
        encryptionKey,
        nonce,
      );

      if (!storedMemberState) {
        throw new Error("Failed to load member state from file");
      }

      const loadedMember = Member.fromJSON(JSON.parse(storedMemberState));

      console.log("Loaded member: ", loadedMember.credential.ecdhPublicKey);

      setMember(loadedMember);
      setCredentials(loadedMember.credential);
      setPseudonym(loadedMember.pseudonym);
    } catch {
      // No member state exists, create new member
      console.log("No member state found, creating new member");
      await generateNewMember(generateRandomName());
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

      // Serialize and store member state in encrypted file
      const serialized = newMember.toJSON();
      const nonce = await saveToAppDirectory(
        JSON.stringify(serialized),
        MEMBER_STATE_FILENAME,
        encryptionKey,
      );

      if (!nonce) {
        throw new Error("Failed to save member state to file");
      }

      // Store encryption key and nonce in secure store
      await secureStore(
        ENCRYPTION_KEY_STORE_KEY,
        Buffer.from(encryptionKey).toString("base64"),
      );
      await secureStore(
        NONCE_STORE_KEY,
        Buffer.from(nonce.data).toString("base64"),
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
      // Load encryption key and nonce from secure store
      const encryptionKeyBase64 = await secureFetch(ENCRYPTION_KEY_STORE_KEY);

      const encryptionKey = Buffer.from(encryptionKeyBase64, "base64");

      // Delete existing file and create new one
      const { File, Paths } = await import("expo-file-system");
      const existingFile = new File(Paths.cache, MEMBER_STATE_FILENAME);
      if (existingFile.exists) {
        existingFile.delete();
      }

      // Serialize and save to encrypted file
      const serialized = member.toJSON();
      const nonce = await saveToAppDirectory(
        JSON.stringify(serialized),
        MEMBER_STATE_FILENAME,
        encryptionKey,
      );
      await secureStore(
        NONCE_STORE_KEY,
        Buffer.from(nonce!.data).toString("base64"),
      );
    } catch (error) {
      console.error("Failed to save member:", error);
      throw error;
    }
  };

  const deleteMember = async () => {
    // Delete existing file and create new one
    const { File, Paths } = await import("expo-file-system");
    const existingFile = new File(Paths.cache, MEMBER_STATE_FILENAME);
    if (existingFile.exists) {
      existingFile.delete();
      initializeMember();
    }
  };

  const value: CredentialContextType = {
    member,
    credentials,
    isLoading,
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
