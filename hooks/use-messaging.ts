import base64 from 'react-native-base64';
import useBLE from "./use-ble";

function useMessaging(serviceUUID: string, characteristicUUID: string) {
    const { connectedDevices } = useBLE()

    const sendMessage = (message: Message) => {
        connectedDevices.forEach((device) => {
            device.writeCharacteristicWithoutResponseForService(
                serviceUUID,
                characteristicUUID,
                base64.encode(message.contents)
            )
        })
    }

    return {
        sendMessage,
   };
}

export default useMessaging