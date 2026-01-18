// Reexport the native module. On web, it will be resolved to BleModule.web.ts
// and on native platforms to BleModule.ts
export * from "./src/Ble.types";
export { default } from "./src/BleModule";
