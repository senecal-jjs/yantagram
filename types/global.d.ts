type Message = {
    id: string
    contents: string
    isMine: boolean
}

type Conversation = {
    id: string
    name: string
    lastMessage: string
    timestamp: string
}
