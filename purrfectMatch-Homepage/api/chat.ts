import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { getCurrentUser } from "./firebaseAuth";

const COLLECTION = "chat_messages";

export type ChatMessage = {
  id: string;
  text: string;
  userId: string;
  username: string;
  createdAt: Date;
};

export async function sendChatMessage(text: string) {
  const user = getCurrentUser();
  if (!user) throw new Error("Not logged in");
  const username = user.displayName || user.email || "User";
  await addDoc(collection(db, COLLECTION), {
    text,
    userId: user.uid,
    username,
    createdAt: serverTimestamp(),
  });
}

export function subscribeToChat(
  onMessages: (msgs: ChatMessage[]) => void,
  maxMessages: number = 100
) {
  const q = query(
    collection(db, COLLECTION),
    orderBy("createdAt", "desc"),
    limit(maxMessages)
  );
  return onSnapshot(q, (snap) => {
    const msgs: ChatMessage[] = snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        text: data.text,
        userId: data.userId,
        username: data.username,
        createdAt: data.createdAt?.toDate
          ? data.createdAt.toDate()
          : new Date(),
      };
    });
    onMessages(msgs.reverse());
  });
}
