import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import { Image as ExpoImage } from "expo-image";
import { listPlacesFirebase, PlaceType } from "../../api/places";
import Constants from "expo-constants";

const PLACE_TYPES: { label: string; value: PlaceType; color: string }[] = [
  { label: "Parks", value: "park", color: "#4b2e83" },
  { label: "Cafes", value: "cafe", color: "#b7a57a" },
  { label: "Trails", value: "trail", color: "#2f9e44" },
  { label: "Other", value: "other", color: "#6b7280" },
];

type GooglePlace = {
  id: string;
  name: string;
  type: PlaceType;
  address?: string;
  lat: number;
  lng: number;
  photoUrl?: string | null;
  photoRefs?: string[];
};

async function fetchGooglePhoto(photoRef: string, apiKey: string): Promise<string | null> {
  // This returns a URL that redirects; expo-image can follow it
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${photoRef}&key=${apiKey}`;
}

export default function PlacesScreen() {
  const router = useRouter();
  const [places, setPlaces] = useState<any[]>([]);
  const [googlePlaces, setGooglePlaces] = useState<GooglePlace[]>([]);
  const [mapRegion, setMapRegion] = useState<Region | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<PlaceType | "all">("all");

  const filtered = useMemo(() => {
    const combined = [...places, ...googlePlaces];
    const typeFiltered = filterType === "all" ? combined : combined.filter((p) => p.type === filterType);
    if (!mapRegion) return typeFiltered;
    const latRange = mapRegion.latitudeDelta / 2;
    const lngRange = mapRegion.longitudeDelta / 2;
    const minLat = mapRegion.latitude - latRange;
    const maxLat = mapRegion.latitude + latRange;
    const minLng = mapRegion.longitude - lngRange;
    const maxLng = mapRegion.longitude + lngRange;
    return typeFiltered.filter(
      (p) => p.lat >= minLat && p.lat <= maxLat && p.lng >= minLng && p.lng <= maxLng
    );
  }, [places, googlePlaces, filterType, mapRegion]);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listPlacesFirebase(80);
      setPlaces(data);
      await fetchGooglePlaces(filterType === "all" ? "park" : filterType);
    } catch (err: any) {
      setLoadError(err?.message || "Failed to load places");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    fetchGooglePlaces(filterType === "all" ? "park" : filterType);
  }, [filterType]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handlePickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      quality: 0.5,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (!res.canceled && res.assets?.[0]?.uri) {
      setForm((f) => ({ ...f, photoUri: res.assets[0].uri }));
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;
    if (!form.name.trim()) {
      Alert.alert("Name required", "Please add a place name.");
      return;
    }
    if (!form.lat || !form.lng) {
      Alert.alert("Location required", "Please provide latitude and longitude.");
      return;
    }
    setSubmitting(true);
    try {
      let photoUrl: string | undefined;
      if (form.photoUri) {
        photoUrl = await uploadPlaceImage(form.photoUri);
      }
      await createPlaceFirebase({
        name: form.name.trim(),
        type: form.type,
        address: form.address.trim(),
        notes: form.notes.trim(),
        parking: form.parking.trim(),
        lat: parseFloat(form.lat),
        lng: parseFloat(form.lng),
        photoUrl,
      });
      setForm({
        name: "",
        type: "park",
        address: "",
        notes: "",
        parking: "",
        lat: "",
        lng: "",
        photoUri: null,
      });
      setModalVisible(false);
      await load();
    } catch (err) {
      console.error("Failed to create place:", err);
      Alert.alert("Error", "Could not save place. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const fetchGooglePlaces = async (type: PlaceType = "park") => {
    const apiKey = Constants?.expoConfig?.extra?.googleMapsApiKey || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;
    try {
      // Seattle fallback location; could be current location later
      const lat = 47.6062;
      const lng = -122.3321;
      const radius = 20000; // meters
      const keyword =
        type === "cafe"
          ? encodeURIComponent("dog friendly cafe")
          : type === "trail"
          ? encodeURIComponent("dog friendly trail")
          : encodeURIComponent("dog park");
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?keyword=${keyword}&location=${lat},${lng}&radius=${radius}&key=${apiKey}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.status !== "OK") {
        console.warn("Google places fetch status:", json.status);
        return;
      }
      const mapped: GooglePlace[] = await Promise.all(
        (json.results || []).slice(0, 25).map(async (r: any) => {
          let photoUrl: string | null = null;
          const photoRefs: string[] = [];
          if (r.photos?.[0]?.photo_reference) {
            photoUrl = await fetchGooglePhoto(r.photos[0].photo_reference, apiKey);
            photoRefs.push(r.photos[0].photo_reference);
            r.photos.slice(1, 5).forEach((p: any) => {
              if (p.photo_reference) photoRefs.push(p.photo_reference);
            });
          }
          return {
            id: r.place_id,
            name: r.name,
            type,
            address: r.vicinity,
            lat: r.geometry?.location?.lat,
            lng: r.geometry?.location?.lng,
            photoUrl,
            photoRefs,
          };
        })
      );
      setGooglePlaces(mapped);
    } catch (err) {
      console.warn("Failed to fetch Google places", err);
    }
  };

  const defaultRegion: Region = {
    latitude: filtered[0]?.lat ?? 47.6062,
    longitude: filtered[0]?.lng ?? -122.3321,
    latitudeDelta: 0.15,
    longitudeDelta: 0.15,
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.container}>
        <ScrollView
          style={{ flex: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4b2e83" />}
        >
          <View style={styles.mapWrapper}>
            <MapView
              style={StyleSheet.absoluteFill}
              initialRegion={defaultRegion}
              showsUserLocation
              onRegionChangeComplete={(region) => setMapRegion(region)}
            >
              {filtered.map((p) => (
                <Marker
                  key={p.id}
                  coordinate={{ latitude: p.lat, longitude: p.lng }}
                  title={p.name}
                  description={p.type}
                  pinColor={PLACE_TYPES.find((t) => t.value === p.type)?.color || "#4b2e83"}
                />
              ))}
            </MapView>
          </View>

          <View style={styles.filterRow}>
            {PLACE_TYPES.map((t) => (
              <TouchableOpacity
                key={t.value}
                style={[
                  styles.filterChip,
                  filterType === t.value && { backgroundColor: t.color, borderColor: t.color },
                ]}
                onPress={() => setFilterType(filterType === t.value ? "all" : t.value)}
              >
                <Ionicons
                  name={
                    t.value === "park"
                      ? "leaf"
                      : t.value === "cafe"
                      ? "cafe"
                      : t.value === "trail"
                      ? "walk"
                      : "paw"
                  }
                  size={16}
                  color={filterType === t.value ? "#f6f2e9" : "#4b2e83"}
                />
                <Text style={[styles.filterText, filterType === t.value && { color: "#f6f2e9" }]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}

          {loading && places.length === 0 ? (
            <View style={{ padding: 20, alignItems: "center" }}>
              <ActivityIndicator color="#4b2e83" />
            </View>
          ) : null}
          {filtered.map((p) => (
            <View key={p.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.cardTitle}>{p.name}</Text>
                  <Text style={styles.cardMeta}>{p.type} • {p.address || "No address"}</Text>
                </View>
                <Ionicons name="navigate" size={18} color="#4b2e83" />
              </View>
              {p.photoUrl ? (
                <ExpoImage
                  source={{ uri: p.photoUrl }}
                  style={styles.photo}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              ) : null}
              {p.notes ? <Text style={styles.notes}>{p.notes}</Text> : null}
              {p.parking ? <Text style={styles.parking}>Parking: {p.parking}</Text> : null}
            </View>
          ))}
          {!loading && filtered.length === 0 ? (
            <View style={{ padding: 24, alignItems: "center" }}>
              <Text style={{ color: "#4b2e83", fontWeight: "700" }}>No places yet.</Text>
              <Text style={{ color: "#4b2e83" }}>Be the first to add one!</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f6f2e9",
  },
  mapWrapper: {
    height: 240,
    borderRadius: 14,
    overflow: "hidden",
    margin: 12,
    borderWidth: 1,
    borderColor: "rgba(75,46,131,0.2)",
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    justifyContent: "space-between",
  },
  filterChip: {
    flex: 1,
    minWidth: "22%",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#b7a57a",
    backgroundColor: "#f9f6ee",
    alignItems: "center",
  },
  filterText: {
    color: "#4b2e83",
    fontWeight: "700",
    marginTop: 4,
  },
  errorText: { color: "red", textAlign: "center", marginBottom: 8 },
  card: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(75,46,131,0.2)",
    shadowColor: "#4b2e83",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  cardTitle: { fontSize: 16, fontWeight: "800", color: "#1f1533" },
  cardMeta: { color: "#4b2e83", fontSize: 12 },
  photo: { width: "100%", height: 180, borderRadius: 10, marginBottom: 10 },
  notes: { color: "#1f1533", marginBottom: 6, lineHeight: 18 },
  parking: { color: "#4b2e83", fontWeight: "600" },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#4b2e83",
    marginBottom: 12,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbb89f",
    backgroundColor: "#f9f6ee",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    color: "#1f1533",
  },
  photoButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9f6ee",
    borderWidth: 1,
    borderColor: "#b7a57a",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  photoButtonText: { marginLeft: 6, color: "#4b2e83", fontWeight: "700" },
  saveButton: {
    backgroundColor: "#4b2e83",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  saveButtonText: { color: "#f6f2e9", fontWeight: "800" },
  cancelButton: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#b7a57a",
    alignItems: "center",
  },
  cancelButtonText: { color: "#4b2e83", fontWeight: "700" },
});
