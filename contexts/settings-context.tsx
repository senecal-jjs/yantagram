import { fetchFromFile, saveToAppDirectory } from "@/utils/file";
import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

export type NotificationContentOption = "nameOnly" | "nameAndContent";

interface Settings {
  messageRetentionMinutes: number;
  notificationsEnabled: boolean;
  notificationContent: NotificationContentOption;
  theme: "dark" | "light" | "auto";
  autoDeleteMessages: boolean;
  encryptionEnabled: boolean;
  lastUpdated: string;
}

interface SettingsContextType {
  settings: Settings;
  updateSetting: <K extends keyof Settings>(
    key: K,
    value: Settings[K],
  ) => Promise<void>;
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>;
  resetSettings: () => Promise<void>;
  isLoading: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  messageRetentionMinutes: 60,
  notificationsEnabled: true,
  notificationContent: "nameAndContent",
  theme: "dark",
  autoDeleteMessages: true,
  encryptionEnabled: true,
  lastUpdated: new Date().toISOString(),
};

const SETTINGS_FILE = "app_settings.json";

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined,
);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setIsLoading(true);
        const settingsData = await fetchFromFile(SETTINGS_FILE);
        if (settingsData) {
          const loadedSettings = JSON.parse(settingsData);
          setSettings({
            ...DEFAULT_SETTINGS,
            ...loadedSettings,
          });
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, []);

  // Save settings to file
  const saveSettings = async (newSettings: Settings) => {
    try {
      const settingsToSave = {
        ...newSettings,
        lastUpdated: new Date().toISOString(),
      };
      await saveToAppDirectory(JSON.stringify(settingsToSave), SETTINGS_FILE);
    } catch (error) {
      console.error("Failed to save settings:", error);
      throw error;
    }
  };

  // Update a single setting
  const updateSetting = async <K extends keyof Settings>(
    key: K,
    value: Settings[K],
  ): Promise<void> => {
    const newSettings = {
      ...settings,
      [key]: value,
    };
    setSettings(newSettings);
    await saveSettings(newSettings);
  };

  // Update multiple settings
  const updateSettings = async (
    newSettings: Partial<Settings>,
  ): Promise<void> => {
    const updatedSettings = {
      ...settings,
      ...newSettings,
    };
    setSettings(updatedSettings);
    await saveSettings(updatedSettings);
  };

  // Reset to default settings
  const resetSettings = async (): Promise<void> => {
    const resetSettings = {
      ...DEFAULT_SETTINGS,
      lastUpdated: new Date().toISOString(),
    };
    setSettings(resetSettings);
    await saveSettings(resetSettings);
  };

  const value: SettingsContextType = {
    settings,
    updateSetting,
    updateSettings,
    resetSettings,
    isLoading,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = (): SettingsContextType => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
};
