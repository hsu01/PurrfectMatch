import { useRouter } from 'expo-router'
import React, { useState } from 'react'
import { StyleSheet, Text, TextInput, TouchableOpacity, View, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { signupFirebase } from "../api/firebaseAuth";

export default function SignUp() {
  const router = useRouter()

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState(''); // ✅ NEW
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    setPasswordError('');

    if (!email || !username || !password || !confirmPassword) {
      Alert.alert("Error", "Please fill out all fields");
      return;
    }

    // ✅ INLINE PASSWORD CHECK
    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      console.log('Attempting Firebase signup...');
      const data = await signupFirebase({ email, username, password });

      if (data.ok) {
        setLoading(false);
        Alert.alert("Success", "Account created successfully!", [
          {
            text: "OK",
            onPress: () => router.push("../(tabs)/profile"),
          },
        ]);

        setEmail("");
        setUsername("");
        setPassword("");
        setConfirmPassword("");
        setPasswordError("");
      } else {
        Alert.alert("Signup failed", data.message || "Something went wrong");
        setLoading(false);
      }
    } catch (error: any) {
      const message = error.message || "Could not connect to Firebase";
      Alert.alert("Signup failed", message);
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.signUp}>
          <Text style={styles.title}>Sign Up</Text>

          <Text style={styles.account_create}>Enter your email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="next"
          />

          <Text style={styles.account_create}>Enter your username</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            returnKeyType="next"
          />

          <Text style={styles.account_create}>Enter your password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setPasswordError('');
            }}
            autoCapitalize="none"
            secureTextEntry
            returnKeyType="next"
          />

          <Text style={styles.account_create}>Re-enter your password</Text>
          <TextInput
            style={[
              styles.input,
              passwordError && { borderColor: 'red' } // ✅ RED BORDER ON ERROR
            ]}
            value={confirmPassword}
            onChangeText={(text) => {
              setConfirmPassword(text);
              setPasswordError('');
            }}
            autoCapitalize="none"
            secureTextEntry
            returnKeyType="done"
          />

          {/* ✅ RED ERROR TEXT */}
          {passwordError ? (
            <Text style={styles.errorText}>{passwordError}</Text>
          ) : null}

          <TouchableOpacity
            style={[styles.button, loading && { backgroundColor: "#aaa" }]}
            onPress={handleSignUp}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? "Signing Up..." : "Register"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#f2f4f7',
    padding: 16,
    justifyContent: 'center',
    paddingBottom: 40,
  },
  signUp: {
    backgroundColor: '#fff',
    padding: 30,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius:10
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center'
  },
  account_create: {
    fontSize: 14,
    color: '#444',
    marginBottom: 8
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fafafa',
    marginBottom: 20
  },
  button: {
    backgroundColor: "#007AFF",
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: "center"
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600"
  },
  errorText: {
    color: 'red',
    fontSize: 13,
    marginTop: -12,
    marginBottom: 12,
  },
})
