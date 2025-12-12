import * as SecureStore from "expo-secure-store";

const secureStore = async (key: string, value: string) => {
  await SecureStore.setItemAsync(key, value);
};

const secureFetch = async (key: string): Promise<string> => {
  let result = await SecureStore.getItemAsync(key);

  if (result) {
    return result;
  } else {
    throw new Error(`Cannot find value for key [${key}]`);
  }
};

const removeSecureStore = async (key: string) => {
  SecureStore.deleteItemAsync(key);
};

export { removeSecureStore, secureFetch, secureStore };
