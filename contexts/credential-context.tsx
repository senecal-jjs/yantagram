import { Credentials, SerializedCredentials } from "@/treekem/types";
import { ECDHKeyPair, SignatureMaterial } from "@/treekem/upke";
import { generateRandomNameCapitalized } from "@/utils/names";
import { secureFetch, secureStore } from "@/utils/secure-store";
import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

const CREDENTIALS_KEY = "treekem_credentials";
const SIGNING_MATERIAL_KEY = "treekem_signing_material";
const ECDH_KEYPAIR_KEY = "treekem_ecdh_keypair";

interface CredentialContextType {
  credentials: Credentials | null;
  isLoading: boolean;
  pseudonym: string | null;
  updatePseudonym: (newPseudonym: string) => Promise<void>;
  regenerateCredentials: (pseudonym: string) => Promise<void>;
}

const CredentialContext = createContext<CredentialContextType | undefined>(
  undefined,
);

export const CredentialProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [pseudonym, setPseudonym] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Load credentials from secure store or generate new ones
   */
  useEffect(() => {
    const initializeCredentials = async () => {
      try {
        setIsLoading(true);

        // Try to load existing credentials
        const storedCreds = await secureFetch(CREDENTIALS_KEY);
        const serialized: SerializedCredentials = JSON.parse(storedCreds);

        const creds: Credentials = {
          verificationKey: Buffer.from(serialized.verificationKey, "base64"),
          pseudonym: serialized.pseudonym,
          signature: Buffer.from(serialized.signature, "base64"),
          ecdhPublicKey: Buffer.from(serialized.ecdhPublicKey, "base64"),
        };

        setCredentials(creds);
        setPseudonym(creds.pseudonym);
      } catch {
        // No credentials exist, generate new ones with default pseudonym
        console.log("No credentials found, generating new ones");
        await generateNewCredentials(generateRandomNameCapitalized());
      } finally {
        setIsLoading(false);
      }
    };

    initializeCredentials();
  }, []);

  /**
   * Generate new credentials and store them securely
   */
  const generateNewCredentials = async (newPseudonym: string) => {
    try {
      setIsLoading(true);

      // Generate signing material (Ed25519)
      const signingMaterial = SignatureMaterial.generate();

      // Generate ECDH keypair (X25519)
      const ecdhKeyPair = ECDHKeyPair.generate();

      // Create signature
      const signature = signingMaterial.sign(signingMaterial.publicKey);

      // Create credentials
      const creds: Credentials = {
        verificationKey: signingMaterial.publicKey,
        pseudonym: newPseudonym,
        signature,
        ecdhPublicKey: ecdhKeyPair.publicKey,
      };

      // Serialize for storage
      const serialized: SerializedCredentials = {
        verificationKey: Buffer.from(creds.verificationKey).toString("base64"),
        pseudonym: creds.pseudonym,
        signature: Buffer.from(creds.signature).toString("base64"),
        ecdhPublicKey: Buffer.from(creds.ecdhPublicKey).toString("base64"),
      };

      // Store credentials
      await secureStore(CREDENTIALS_KEY, JSON.stringify(serialized));

      // Store signing material (private key)
      await secureStore(
        SIGNING_MATERIAL_KEY,
        JSON.stringify({
          publicKey: Buffer.from(signingMaterial.publicKey).toString("base64"),
          privateKey: Buffer.from(signingMaterial.privateKey).toString(
            "base64",
          ),
        }),
      );

      // Store ECDH keypair (private key)
      await secureStore(
        ECDH_KEYPAIR_KEY,
        JSON.stringify({
          publicKey: Buffer.from(ecdhKeyPair.publicKey).toString("base64"),
          privateKey: Buffer.from(ecdhKeyPair.privateKey).toString("base64"),
        }),
      );

      setCredentials(creds);
      setPseudonym(newPseudonym);
    } catch (error) {
      console.error("Failed to generate credentials:", error);
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

      // Load existing signing material
      const signingData = await secureFetch(SIGNING_MATERIAL_KEY);
      const { publicKey: pubKeyBase64, privateKey: privKeyBase64 } =
        JSON.parse(signingData);

      const signingMaterial = new SignatureMaterial(
        Buffer.from(pubKeyBase64, "base64"),
        Buffer.from(privKeyBase64, "base64"),
      );

      // Create new signature with updated pseudonym
      const signature = signingMaterial.sign(signingMaterial.publicKey);

      // Update credentials
      const updatedCreds: Credentials = {
        ...credentials!,
        pseudonym: newPseudonym,
        signature,
      };

      // Serialize and store
      const serialized: SerializedCredentials = {
        verificationKey: Buffer.from(updatedCreds.verificationKey).toString(
          "base64",
        ),
        pseudonym: updatedCreds.pseudonym,
        signature: Buffer.from(updatedCreds.signature).toString("base64"),
        ecdhPublicKey: Buffer.from(updatedCreds.ecdhPublicKey).toString(
          "base64",
        ),
      };

      await secureStore(CREDENTIALS_KEY, JSON.stringify(serialized));

      setCredentials(updatedCreds);
      setPseudonym(newPseudonym);
    } catch (error) {
      console.error("Failed to update pseudonym:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Regenerate all credentials (new keys)
   */
  const regenerateCredentials = async (newPseudonym: string) => {
    await generateNewCredentials(newPseudonym);
  };

  const value: CredentialContextType = {
    credentials,
    isLoading,
    pseudonym,
    updatePseudonym,
    regenerateCredentials,
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
