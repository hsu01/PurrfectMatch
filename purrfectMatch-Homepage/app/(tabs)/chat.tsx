import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { sendChatMessage, subscribeToChat, ChatMessage } from "../../api/chat";
import { getCurrentUser } from "../../api/firebaseAuth";

export default function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    const unsub = subscribeToChat((msgs) => {
      setMessages(msgs);
      setLoading(false);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });
    return () => unsub();
  }, []);

  const handleSend = async () => {
    if (sending) return;
    const text = input.trim();
    if (!text) return;
    const user = getCurrentUser();
    if (!user) {
      Alert.alert("Not Logged In", "Please log in to chat.");
      return;
    }
    setSending(true);
    try {
      await sendChatMessage(text);
      setInput("");
    } catch (err) {
      console.error("Failed to send message", err);
      Alert.alert("Error", "Could not send message.");
    } finally {
      setSending(false);
    }
  };

  const renderItem = ({ item }: { item: ChatMessage }) => {
    const me = getCurrentUser()?.uid === item.userId;
    return (
      <View style={[styles.msgContainer, me ? styles.msgMe : styles.msgOther]}>
        <Text style={styles.msgAuthor}>{item.username}</Text>
        <Text style={styles.msgText}>{item.text}</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
    >
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Global chat room</Text>
        <Text style={styles.bannerText}>Messages here are visible to everyone. Please keep it friendly.</Text>
      </View>
      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color="#4b2e83" />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 80 }}
        />
      )}

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="Say hi..."
          value={input}
          onChangeText={setInput}
          multiline
        />
        <TouchableOpacity style={[styles.sendButton, sending && { opacity: 0.6 }]} onPress={handleSend} disabled={sending}>
          <Text style={styles.sendButtonText}>{sending ? "..." : "Send"}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f6f2e9" },
  inputBar: {
    flexDirection: "row",
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: "#e7ddc9",
    backgroundColor: "#fff",
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: "#cbb89f",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#f9f6ee",
    color: "#1f1533",
  },
  sendButton: {
    marginLeft: 8,
    backgroundColor: "#4b2e83",
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonText: { color: "#f6f2e9", fontWeight: "700" },
  msgContainer: {
    padding: 10,
    borderRadius: 10,
    marginBottom: 8,
    maxWidth: "80%",
  },
  msgMe: { backgroundColor: "#4b2e83", alignSelf: "flex-end" },
  msgOther: { backgroundColor: "#ebe3d0", alignSelf: "flex-start" },
  msgAuthor: { fontWeight: "700", color: "#f6f2e9" },
  msgText: { color: "#fff" },
  banner: {
    padding: 12,
    backgroundColor: "#ebe3d0",
    borderBottomWidth: 1,
    borderBottomColor: "#e7ddc9",
  },
  bannerTitle: { color: "#4b2e83", fontWeight: "800" },
  bannerText: { color: "#4b2e83", marginTop: 4 },
});
