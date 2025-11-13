import { useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Keyboard, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { ChatBubble } from '@/components/chat-bubble';
import { COLOR_CHARACTERISTIC_UUID, DATA_SERVICE_UUID } from '@/hooks/use-ble';
import useMessaging from '@/hooks/use-messaging';

const renderMessage = ({item}: { item: Message }) => {
  return <ChatBubble message={item} />
}

export default function Chat() {
  const navigation = useNavigation()
  const { chatId } = useLocalSearchParams<{ chatId: string }>()
  const { sendMessage } = useMessaging(DATA_SERVICE_UUID, COLOR_CHARACTERISTIC_UUID)

  useEffect(() => {
    navigation.setOptions({ 
      title: "Contact"
    });
  }, [navigation]);

  const [messages, setMessages] = useState([
    {
      id: "1",
      contents: "Hello!",
      isMine: true, 
    },
    {
      id: "2",
      contents: "Hello Back!",
      isMine: false, 
    }
  ])

  // State for the new message input
  const [newMessage, setNewMessage] = useState('');

  // A ref to automatically scroll the message list
  const flatListRef = useRef<FlatList>(null);

  const handleSend = () => {
    if (newMessage.trim()) {
      const newMsg = {
        id: Math.random().toString(),
        contents: newMessage,
        isMine: false,
      }

      setMessages([...messages, newMsg])
      setNewMessage('')
      sendMessage(newMsg)

      // scroll to the end of the list to show the new message
      flatListRef.current?.scrollToEnd({ animated: true })

      // dismiss the keyboard after sending
      Keyboard.dismiss()
    }
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.mainContainer}>
        <KeyboardAvoidingView
          style={styles.keyboardAvoidingView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <FlatList
            ref={flatListRef}
            data={messages}
            showsVerticalScrollIndicator={false}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
          />

          <View style={styles.inputContainer}>
            <TextInput 
              style={styles.input}
              value={newMessage}
              onChangeText={setNewMessage}
              placeholder="What's on your mind?"
              placeholderTextColor="gray"
              multiline
            />
            <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
              <Text>Send</Text>
            </TouchableOpacity>    
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  message: {
    backgroundColor: '#2377F1',
    borderRadius: '20px'
  },
  mainContainer: {
    flex: 1,
    backgroundColor: '#090909ff'
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#090909ff',
    color: 'white',
    borderRadius: 25,
    paddingHorizontal: 15,
    paddingTop: 10,
    paddingBottom: 10,
    maxHeight: 120,
    borderColor: 'rgba(172, 169, 169, 0.2)',
    borderWidth: 1,
  },
  sendButton: {
    marginLeft: 10,
    backgroundColor: '#0B93F6',
    borderRadius: 25,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});