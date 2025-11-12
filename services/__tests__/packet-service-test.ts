import { decode, encode } from "../packet-service"
import { fromBinaryPayload, toBinaryPayload } from "../protocol-service"

test("encode & decode packet", () => {
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
    }

    const encoded = toBinaryPayload(message)!

    const packet: BitchatPacket = {
        version: 1,
        type: 1,
        senderId: "1",
        recipientId: "2",
        timestamp: Date.now(),
        payload: encoded,
        signature: null,
        allowedHops: 3,
        route: new Uint8Array()
    }

    const encodedPacket = encode(packet)!
    const decodedPacket = decode(encodedPacket)
    const decodedMessage = fromBinaryPayload(decodedPacket!.payload)

    expect(decodedMessage).toEqual(message)
})