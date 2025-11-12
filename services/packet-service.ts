import CompressionUtil from "./compression-service"
import { MessagePadding } from "./padding-service"

const currentHeaderSize = 16
const senderIdSize = 8
const recipientIdSize = 8
const signatureSize = 64
const lengthFieldBytes = 4

const offsets = {
    version: 0,
    type: 1,
    allowedHops: 2,
    timestamp: 3,
    flags: 11, // After version(1) + type(1) + allowedHops(1) + timestamp(8)
}

const flags = {
    hasRecipient: 0x01,
    hasSignature: 0x02,
    isCompressed: 0x04,
    hasRoute: 0x08,
}

// Encode BitchatPacket to binary format
const encode = (packet: BitchatPacket, padding: boolean = true): Uint8Array | null => {
    const version = packet.version 
    if (version !== 1) return null

    // Convert string payload to Uint8Array
    const textEncoder = new TextEncoder()
    let payload = packet.payload
    let isCompressed = false
    let originalPayloadSize: number | null = null

    // Try to compress payload when beneficial
    if (CompressionUtil.shouldCompress(payload)) {
        const maxRepresentable = 0xFFFFFFFF
        if (payload.length <= maxRepresentable) {
            const compressedPayload = CompressionUtil.compress(payload)
            if (compressedPayload) {
                originalPayloadSize = payload.length
                payload = compressedPayload
                isCompressed = true
            }
        }
    }
 
    // Handle route data
    const originalRoute = packet.route ? [packet.route] : [] // Adapt to array format
    const sanitizedRoute: Uint8Array[] = originalRoute.map(hop => {
        if (hop.length === senderIdSize) return hop
        if (hop.length > senderIdSize) return hop.subarray(0, senderIdSize)
        const padded = new Uint8Array(senderIdSize)
        padded.set(hop)
        return padded
    })

    if (sanitizedRoute.length > 255) return null

    const hasRoute = sanitizedRoute.length > 0
    const routeLength = hasRoute ? 1 + sanitizedRoute.length * senderIdSize : 0
    const originalSizeFieldBytes = isCompressed ? lengthFieldBytes : 0
    const payloadDataSize = routeLength + payload.length + originalSizeFieldBytes

    // Check payload size limits
    if (version === 1 && payloadDataSize > 0xFFFFFFFF) return null

    // Build the packet
    const data: number[] = []

    // Version, type, TTL/allowedHops
    data.push(version)
    data.push(packet.type)
    data.push(packet.allowedHops)

    // Timestamp (8 bytes, big-endian)
    const timestamp = packet.timestamp
    for (let shift = 56; shift >= 0; shift -= 8) {
        data.push((timestamp >>> shift) & 0xFF)
    }

    // Flags
    let flagsByte = 0
    if (packet.recipientId) flagsByte |= flags.hasRecipient
    if (packet.signature) flagsByte |= flags.hasSignature
    if (isCompressed) flagsByte |= flags.isCompressed
    if (hasRoute) flagsByte |= flags.hasRoute
    data.push(flagsByte)

    // Payload length (4 bytes, big-endian)
    const length = payloadDataSize
    for (let shift = 24; shift >= 0; shift -= 8) {
        data.push((length >> shift) & 0xFF)
    }

    // Sender ID (8 bytes, padded if necessary)
    const senderBytes = textEncoder.encode(packet.senderId)
    const senderPadded = new Uint8Array(senderIdSize)
    senderPadded.set(senderBytes.subarray(0, senderIdSize))
    data.push(...Array.from(senderPadded))

    // Recipient ID (8 bytes, if present)
    if (packet.recipientId) {
        const recipientBytes = textEncoder.encode(packet.recipientId)
        const recipientPadded = new Uint8Array(recipientIdSize)
        recipientPadded.set(recipientBytes.subarray(0, recipientIdSize))
        data.push(...Array.from(recipientPadded))
    }

    // Route data (if present)
    if (hasRoute) {
        data.push(sanitizedRoute.length)
        for (const hop of sanitizedRoute) {
            data.push(...Array.from(hop))
        }
    }

    // Original size field (if compressed)
    if (isCompressed && originalPayloadSize !== null) {
        const size = originalPayloadSize
        for (let shift = 24; shift >= 0; shift -= 8) {
            data.push((size >> shift) & 0xFF)
        }
    }

    // Payload data
    data.push(...Array.from(payload))

    // Signature (if present)
    if (packet.signature) {
        const signatureBytes = textEncoder.encode(packet.signature)
        const signaturePadded = new Uint8Array(signatureSize)
        signaturePadded.set(signatureBytes.subarray(0, signatureSize))
        data.push(...Array.from(signaturePadded))
    }

    let result = new Uint8Array(data)

    // Apply padding if requested
    if (padding) {
        const optimalSize = MessagePadding.optimalBlockSize(result.length)
        result = new Uint8Array(MessagePadding.pad(result, optimalSize))
    }

    return result
}

// Decode binary data to BitchatPacket
const decode = (data: Uint8Array): BitchatPacket | null => {
    // Try decode as-is first (robust when padding wasn't applied)
    const packet = decodeCore(data)
    if (packet) return packet
    
    // If that fails, try after removing padding
    const unpadded = MessagePadding.unpad(data)
    if (unpadded === data) return null // No padding was removed
    return decodeCore(unpadded)
}

// Core decoding implementation used by decode with and without padding removal
const decodeCore = (raw: Uint8Array): BitchatPacket | null => {
    const minHeaderSize = 14 // v1 header size
    if (raw.length < minHeaderSize + senderIdSize) return null

    let offset = 0
    const textDecoder = new TextDecoder('utf-8')

    // Helper functions for reading data
    const require = (n: number): boolean => offset + n <= raw.length
    
    const read8 = (): number | null => {
        if (!require(1)) return null
        return raw[offset++]
    }
    
    const read16 = (): number | null => {
        if (!require(2)) return null
        const value = (raw[offset] << 8) | raw[offset + 1]
        offset += 2
        return value
    }
    
    const read32 = (): number | null => {
        if (!require(4)) return null
        const value = (raw[offset] << 24) | (raw[offset + 1] << 16) | (raw[offset + 2] << 8) | raw[offset + 3]
        offset += 4
        return value
    }
    
    const readData = (n: number): Uint8Array | null => {
        if (!require(n)) return null
        const data = raw.slice(offset, offset + n)
        offset += n
        return data
    }

    // Read version
    const version = read8()
    if (version === null || (version !== 1)) return null
    
    const minimumRequired = currentHeaderSize + senderIdSize
    if (raw.length < minimumRequired) return null

    // Read type and TTL/allowedHops
    const type = read8()
    const allowedHops = read8()
    if (type === null || allowedHops === null) return null

    // Read timestamp (8 bytes, big-endian)
    let timestamp: number = 0
    for (let i = 0; i < 8; i++) {
        const byte = read8()
        if (byte === null) return null
        timestamp = (timestamp << 8) | byte
    }

    // Read flags
    const flagsByte = read8()
    if (flagsByte === null) return null
    
    const hasRecipient = (flagsByte & flags.hasRecipient) !== 0
    const hasSignature = (flagsByte & flags.hasSignature) !== 0
    const isCompressed = (flagsByte & flags.isCompressed) !== 0
    const hasRoute = (flagsByte & flags.hasRoute) !== 0

    // Read payload length
    let payloadLength: number
    const len = read32()
    if (len === null) return null
    payloadLength = len

    if (payloadLength < 0) return null

    // Read sender ID
    const senderIdBytes = readData(senderIdSize)
    if (!senderIdBytes) return null
    
    // Convert sender ID bytes to string, removing null padding
    const senderIdEnd = senderIdBytes.findIndex(b => b === 0)
    const senderId = textDecoder.decode(senderIdBytes.slice(0, senderIdEnd === -1 ? senderIdBytes.length : senderIdEnd))

    // Read recipient ID (if present)
    let recipientId: string | null = null
    if (hasRecipient) {
        const recipientIdBytes = readData(recipientIdSize)
        if (!recipientIdBytes) return null
        
        // Convert recipient ID bytes to string, removing null padding
        const recipientIdEnd = recipientIdBytes.findIndex(b => b === 0)
        recipientId = textDecoder.decode(recipientIdBytes.slice(0, recipientIdEnd === -1 ? recipientIdBytes.length : recipientIdEnd))
    }

    // Read route data (if present)
    let route: Uint8Array | null = null
    let remainingPayloadBytes = payloadLength

    if (hasRoute) {
        if (remainingPayloadBytes < 1) return null
        const routeCount = read8()
        if (routeCount === null) return null
        remainingPayloadBytes -= 1

        if (routeCount > 0) {
            // For TypeScript version, we'll take the first hop as the route
            // (adapting from Swift's array to single Uint8Array)
            if (remainingPayloadBytes < senderIdSize) return null
            route = readData(senderIdSize)
            if (!route) return null
            remainingPayloadBytes -= senderIdSize

            // Skip remaining hops for now (could be enhanced later)
            const remainingHops = routeCount - 1
            const skipBytes = remainingHops * senderIdSize
            if (remainingPayloadBytes < skipBytes) return null
            readData(skipBytes) // Skip remaining route hops
            remainingPayloadBytes -= skipBytes
        }
    }

    // Read payload
    let payloadData: Uint8Array
    if (isCompressed) {
        if (remainingPayloadBytes < lengthFieldBytes) return null
        
        // Read original size
        let originalSize: number
        const size = read32()
        if (size === null) return null
        originalSize = size
        remainingPayloadBytes -= lengthFieldBytes

        // Security check: prevent decompression bombs
        if (originalSize < 0 || originalSize > 100 * 1024 * 1024) return null // 100MB limit
        
        const compressedSize = remainingPayloadBytes
        if (compressedSize <= 0) return null
        
        const compressed = readData(compressedSize)
        if (!compressed) return null
        remainingPayloadBytes = 0

        // Check compression ratio for safety
        const compressionRatio = originalSize / compressedSize
        if (compressionRatio > 50000) {
            console.warn(`Suspicious compression ratio: ${compressionRatio.toFixed(0)}:1`)
            return null
        }

        // Decompress payload
        const decompressed = CompressionUtil.decompress(compressed, originalSize)
        if (!decompressed || decompressed.length !== originalSize) return null
        
        payloadData = decompressed
    } else {
        if (remainingPayloadBytes < 0) return null
        const rawPayload = readData(remainingPayloadBytes)
        if (!rawPayload) return null
        remainingPayloadBytes = 0
        payloadData = rawPayload
    }

    // Read signature (if present)
    let signature: string | null = null
    if (hasSignature) {
        const signatureBytes = readData(signatureSize)
        if (!signatureBytes) return null
        
        // Convert signature bytes to string
        signature = textDecoder.decode(signatureBytes)
    }

    // Verify we haven't read past the end
    if (offset > raw.length) return null

    return {
        version,
        type,
        senderId,
        recipientId: recipientId || '', // Default to empty string if not present
        timestamp: timestamp,
        payload: payloadData,
        signature,
        allowedHops,
        route: route || new Uint8Array(0) // Default to empty array if not present
    }
}

export { decode, encode }

