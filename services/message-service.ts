function MessageService() {
    const receivePacket = (packet: string) => {
        console.log(packet)
    }

    return {
        receivePacket
    };
}


export default MessageService