import { db } from "../config/firebase";
import {
  addDoc,
  collection,
  getDocs,
  getDocsFromServer,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { getCurrentUser } from "./firebaseAuth";

export type PlaceType = "park" | "cafe" | "trail" | "other";

export interface PlaceFirebase {
  id: string;
  name: string;
  type: PlaceType;
  address?: string;
  lat: number;
  lng: number;
  notes?: string;
  parking?: string;
  photoUrl?: string | null;
  createdAt: Date;
  upvotes?: number;
  authorId?: string | null;
}

const COLLECTION = "places";

export async function listPlacesFirebase(limit: number = 50): Promise<PlaceFirebase[]> {
  try {
    const q = query(collection(db, COLLECTION), orderBy("createdAt", "desc"));
    const snapshot = getDocsFromServer ? await getDocsFromServer(q) : await getDocs(q);
    const places = snapshot.docs.slice(0, limit).map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        name: data.name,
        type: data.type,
        address: data.address,
        lat: data.lat,
        lng: data.lng,
        notes: data.notes,
        parking: data.parking,
        photoUrl: data.photoUrl ?? null,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
        upvotes: data.upvotes ?? 0,
        authorId: data.authorId ?? null,
      } as PlaceFirebase;
    });
    console.log(`Fetched ${places.length} places from Firebase`);
    return places;
  } catch (err) {
    console.error("Error fetching places from Firebase:", err);
    return [];
  }
}

export async function createPlaceFirebase(place: Omit<PlaceFirebase, "id" | "createdAt" | "upvotes" | "authorId">) {
  const currentUser = getCurrentUser();
  try {
    const docRef = await addDoc(collection(db, COLLECTION), {
      ...place,
      upvotes: 0,
      authorId: currentUser?.uid ?? null,
      createdAt: serverTimestamp(),
    });
    console.log("Place created in Firebase with ID:", docRef.id);
    return { id: docRef.id, success: true };
  } catch (err) {
    console.error("Error creating place in Firebase:", err);
    throw err;
  }
}
