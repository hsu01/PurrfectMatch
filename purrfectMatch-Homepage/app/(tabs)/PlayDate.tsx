import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState, useRef, useEffect } from 'react';
import { Image as ExpoImage } from 'expo-image';
import {
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import {createPlaydateFirebase, listPlaydatesFirebase, toggleLikeFirebase, getLikeStatusFirebase, toggleJoinFirebase, getJoinStatusFirebase } from "../../api/playdates";
import MapView, { Marker, Circle } from 'react-native-maps';
import * as ImagePicker from "expo-image-picker";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { app } from "../../config/firebase";
import { getCurrentUser, getUserProfileFirebase } from "../../api/firebaseAuth";
import DateTimePickerModal from "react-native-modal-datetime-picker";

import {timeAgo} from "../playdatePost";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"
];

type CardPost = {
  id: string;
  authorId: string     
  user: string;
  avatar: string;
  time: Date;
  title: string;
  city: string;
  state: string;
  image: string | null;
  description: string;
  whenAt: string;
  likes: number;
  comments: number;
  participants: number;
  liked: boolean;
  joined: boolean;
  address?: string | null;
  zip?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationName?: string | null;
};

export interface PlacePrediction {
  description: string;
  place_id: string;
  types?: string[];
  structured_formatting?: {
    main_text: string;
    secondary_text: string;
  };
}

export interface PlaceDetails {
  name: string;
  formatted_address: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
}

export interface SelectedLocation {
  address: string;
  latitude: number;
  longitude: number;
  types: string[];             // types returned by Google
  placeId?: string;            // optional if you want to link back to Places API
  addressComponents: any[];   // optional if you want more detail
  viewport?: {
    northeast: { lat: number; lng: number };
    southwest: { lat: number; lng: number };
  };
}

export type MapLocation = Omit<SelectedLocation, "addressComponents">;

async function uploadImageToStorage(uri: string): Promise<string> {
  const storage = getStorage(app);
  const response = await fetch(uri);
  const blob = await response.blob();

  const filename = `playdates/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.jpg`;
  const storageRef = ref(storage, filename);

  await uploadBytes(storageRef, blob);
  const downloadUrl = await getDownloadURL(storageRef);
  return downloadUrl;
}

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

export default function PlaydateScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    time: "",
    date: "",
    petBreed: "",
    city: "",
    petImage: "",
    description: "",
    address: "",
    zip: "",
  });

  const [errors, setErrors] = useState({
    time: false,
    date: false,
    petBreed: false,
    location: false,
  });

  const [selectedState, setSelectedState] = useState("WA");
  const [modalVisible, setModalVisible] = useState(false);
  const [posts, setPosts] = useState<CardPost[]>([]);
  const [filteredPosts, setFilteredPosts] = useState<CardPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [localImageUri, setLocalImageUri] = useState<string | null>(null);
  const [likingMap, setLikingMap] = useState<Record<string, boolean>>({});
  const [uploadingImage, setUploadingImage] = useState(false);

  const [locationQuery, setLocationQuery] = useState<string>('');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);

  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedTime, setSelectedTime] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);

  const dynamicCardWidth = width > 900 ? 800 : width > 600 ? 550 : "100%";

  // Called when user types in the input
  const handleLocationInputChange = (text: string) => {
    setLocationQuery(text);
    setSelectedLocation(null); // reset previous validated location

    // Only fetch predictions if text is not empty
    if (text.trim().length > 0) {
      fetchPredictions(text);
    } else {
      setPredictions([]); // clear suggestions if input is empty
    }
  };

  // Fetch predictions from Google Places API
  const fetchPredictions = async (text: string) => {
    if (!text || text.length < 2) {
      setPredictions([]);
      return;
    }

    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
      text
    )}&key=${GOOGLE_MAPS_API_KEY}&components=country:us`;

    try {
      const res = await fetch(url);
      const json = await res.json();
      const preds: PlacePrediction[] = (json.predictions || []).slice(0, 3);
      setPredictions(preds);
    } catch (err) {
      console.error("Autocomplete fetch failed", err);
      setPredictions([]);
    }
  };

  // Called when a prediction is selected from the list
  const onSelectPrediction = (prediction: PlacePrediction) => {
    setLocationQuery(prediction.description); // update input text
    setPredictions([]);                        // hide suggestions
  };

  const getPlaceNameFromPlaceId = async (placeId: string): Promise<string | null> => {
    if (!placeId) return null;

    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error("Missing Google Places API key");
      return null;
    }

    const url =
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name&key=${apiKey}`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (data.status !== "OK") {
        console.warn("Places API error:", data.status, data.error_message);
        return null;
      }

      return data.result?.name ?? null;
    } catch (err) {
      console.error("Failed to fetch place name:", err);
      return null;
    }
  };

  const extractLocationFields = async (loc: SelectedLocation) => {
    if (!loc.addressComponents) 
      return { city: "", state: "", zip: "", neighborhood: "", locationName: loc.address };

    const getComponent = (type: string, useShortName = false) =>
      loc.addressComponents.find(c => c.types.includes(type))?.[useShortName ? "short_name" : "long_name"];

    const city = getComponent("locality") || "";
    const state = getComponent("administrative_area_level_1", true) || ""; // use short name
    const zip = getComponent("postal_code") || "";
    const neighborhood = getComponent("neighborhood") || "";

    // Try to get place name from placeId
    const name = await getPlaceNameFromPlaceId(loc.placeId || "");

    // Determine display name: prefer placeId → named place → neighborhood → ZIP → city → fallback
    const locationName =
      name ||
      loc.addressComponents.find(c =>
        ["establishment", "park", "point_of_interest", "premise"].some(t => c.types.includes(t))
      )?.long_name ||
      neighborhood ||
      zip ||
      city ||
      loc.address;

    return { city, state, zip, neighborhood, locationName };
  };

  const isSpecificPlace = (types: string[]) => {
    return types.some(t =>
      [
        "street_address",
        "premise",
        "subpremise",
        "route",
        "park",
        "establishment",
        "point_of_interest",
      ].includes(t)
    );
  };

  const getRadiusFromViewport = (
    viewport: NonNullable<SelectedLocation["viewport"]>,
    centerLat: number
  ) => {
    const latDiff = Math.abs(viewport.northeast.lat - viewport.southwest.lat);
    const lngDiff = Math.abs(viewport.northeast.lng - viewport.southwest.lng);

    // Convert degrees → meters
    const latMeters = latDiff * 111_000;
    const lngMeters =
      lngDiff * 111_000 * Math.cos((centerLat * Math.PI) / 180);

    // Use diagonal and divide by 2.8 to get radius
    let radius = Math.sqrt(latMeters ** 2 + lngMeters ** 2) / 2.8;

    // Clamp radius to prevent absurd sizes
    radius = Math.min(Math.max(radius, 200), 25_000); // 200m–25km

    return radius;
  };

  const getRegionFromViewport = (
    viewport: NonNullable<SelectedLocation["viewport"]>
  ) => {
    const latitudeDelta =
      Math.abs(viewport.northeast.lat - viewport.southwest.lat) * 1.5;
    const longitudeDelta =
      Math.abs(viewport.northeast.lng - viewport.southwest.lng) * 1.5;

    return { latitudeDelta, longitudeDelta };
  };

  const [, setTick] = useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  const showAlert = (title: string, message: string) => {
    if (typeof window !== "undefined" && (window as any).alert)
      (window as any).alert(`${title}\n\n${message}`);
    else Alert.alert(title, message, [{ text: "OK" }]);
  };

  const handleInputChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key as "time" | "date" | "petBreed" | "location"]) {
      setErrors((prev) => ({ ...prev, [key]: false }));
    }
  };

  const geocodeLocation = async () => {
    const query = locationQuery.trim();
    if (!query) {
      showAlert('Location required', 'Please type a park name or address first.');
      return;
    }

    if (!GOOGLE_MAPS_API_KEY) {
      console.warn('Missing EXPO_PUBLIC_GOOGLE_MAPS_API_KEY');
      showAlert('Config error', 'Map lookup is not configured yet.');
      return;
    }

    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        query
      )}&key=${GOOGLE_MAPS_API_KEY}`;

      const res = await fetch(url);
      const data = await res.json();

      if (data.status !== 'OK' || !data.results.length) {
        showAlert('Not found', 'Could not find the location. Try a more specific address.');
        return;
      }

      const result = data.results[0];

      // Check if the location is too general (state or country)
      if (
        result.types.includes('administrative_area_level_1') || 
        result.types.includes('country')
      ) {
        showAlert('Location too general','Please enter a more specific location.');
        return;
      }

      setSelectedLocation({
        address: result.formatted_address,
        latitude: result.geometry.location.lat,
        longitude: result.geometry.location.lng,
        types: result.types || [],
        placeId: result.place_id,                // optional, exists in Google result
        addressComponents: result.address_components, // optional, full components
        viewport: result.geometry.viewport,
      });

      console.log('Geocoded location:', result.address_components);
      const name = await getPlaceNameFromPlaceId(result.place_id);
      console.log('Resolved place name:', name);

      // Optional: store formatted address in form
      setFormData(prev => ({
        ...prev,
        address: result.formatted_address,
      }));
    } catch (err) {
      console.error('Geocoding failed:', err);
      showAlert('Error', 'Failed to look up that location. Please try again.');
    }
  };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showAlert(
        "Permission needed",
        "We need access to your photo library to upload a picture."
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      setLocalImageUri(asset.uri);
    }
  };

  const toggleLike = async (postId: string) => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      Alert.alert('Not Logged In', 'Please log in to like posts.');
      return;
    }

    try {
      // Optimistic update
      const updatePosts = (prev: CardPost[]) =>
        prev.map(p =>
          p.id === postId
            ? { ...p, liked: !p.liked, likes: p.liked ? Math.max(0, p.likes - 1) : p.likes + 1 }
            : p
        );

      setPosts(updatePosts);
      setFilteredPosts(updatePosts);

      // Update Firebase
      await toggleLikeFirebase(postId, currentUser.uid);
      
      // Reload to sync with Firebase
      //await loadPlaydates();
    } catch (error) {
      console.error('Error toggling like:', error);
      Alert.alert('Error', 'Failed to update like. Please try again.');
      // Revert optimistic update
      await loadPlaydates();
    }
  };

  const toggleJoinPlaydate = async (postId: string) => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      Alert.alert("Not Logged In", "Please log in to join playdates.");
      return;
    }

    try {
      // --- Optimistic update ---
      const updatePosts = (prev: CardPost[]) =>
        prev.map(p =>
          p.id === postId
            ? {
                ...p,
                joined: !p.joined,
                participants: p.joined
                  ? Math.max(0, p.participants - 1)
                  : p.participants + 1,
              }
            : p
        );

      setPosts(updatePosts);
      setFilteredPosts(updatePosts);

      // --- Firebase update ---
      await toggleJoinFirebase(postId, currentUser.uid);

      // --- Sync from Firebase ---
      //await loadPlaydates();

    } catch (error) {
      console.error("Error toggling join:", error);
      Alert.alert("Error", "Failed to update join status. Please try again.");

      // --- Revert optimistic update ---
      await loadPlaydates();
    }
  };

  const handleSubmit = async () => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      Alert.alert("Not Logged In", "Please log in to post.");
      return;
    }

    const trimmedTime = formData.time.trim();
    const trimmedDate = formData.date.trim();

    const trimmedBreed = formData.petBreed.trim();
    //const trimmedCity = formData.city.trim();

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const isDateValid = dateRegex.test(trimmedDate);

    const newErrors = {
      time: !trimmedTime,
      date: !isDateValid,
      petBreed: !trimmedBreed,
      location: !selectedLocation,  // changed from city
    };

    if (newErrors.time || newErrors.date || newErrors.petBreed || newErrors.location) {
      setErrors(newErrors);
      showAlert(
        "Invalid or Missing Fields",
        !isDateValid
          ? "Please enter a valid date in the format YYYY-MM-DD."
          : "Please fill out all required fields."
      );
      return;
    }

    const whenAt = `${trimmedDate} ${trimmedTime}`;  
    const selectedDateTime = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
      selectedTime.getHours(),
      selectedTime.getMinutes(),
      0,
      0
    );

    const now = new Date();
    if (selectedDateTime <= now) {
      showAlert("Invalid Time", "Please select a time in the future.");
      return;
    }

    try {
      setLoading(true);

      let finalImageUrl = "";
      if (localImageUri) {
        try {
          setUploadingImage(true);
          finalImageUrl = await uploadImageToStorage(localImageUri);
        } finally {
          setUploadingImage(false);
        }
      }
      if (!selectedLocation) {
        showAlert("Location required", "Please select a valid location.");
        return;
      }

      const { city, state, zip, neighborhood, locationName } = await extractLocationFields(selectedLocation);
      const { addressComponents, ...locationForSave } = selectedLocation;

      //console.log("Saving playdate with location:", locationName);

      await createPlaydateFirebase({
        authorId: currentUser.uid,
        username: currentUser.displayName || "User",
        title: `Playdate with ${trimmedBreed}`,
        description:
          formData.description.trim() || `${trimmedBreed} playdate scheduled!`,
        dogBreed: trimmedBreed,
        city,
        state,
        zip,
        neighborhood,
        whenAt,
        imageUrl: finalImageUrl,
        likes: 0,
        comments: 0,
        participants: 0,
        locationName,
        location: locationForSave,
      });

      setShowForm(false);
      setFormData({
        time: "",
        date: "",
        petBreed: "",
        city: "",
        petImage: "",
        description: "",
        address: "",
        zip: "",
      });
      setLocationQuery('');
      setPredictions([]);
      setSelectedLocation(null);
      setLocalImageUri(null);

      await loadPlaydates();

      showAlert("Success!", "Your playdate has been posted!");
    } catch (error) {
      console.error("Failed to create playdate:", error);
      Alert.alert("Error", "Failed to create playdate.");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    const city = formData.city.trim().toLowerCase();

    console.log("Searching for city:", city, "and state:", selectedState);

    const results = posts.filter((post) => {
      const matchesState = post.state === selectedState;
      const matchesCity = city ? post.city.toLowerCase() === city : true; // if no city, auto-true

      return matchesCity && matchesState;
    });

    setFilteredPosts(results);
  };

  const loadPlaydates = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const firebasePosts = (await listPlaydatesFirebase()).slice(0, 25);
      const currentUser = getCurrentUser();

      const formattedPosts: CardPost[] = await Promise.all(
        firebasePosts.map(async (post) => {
          // Check if current user liked this post
          const liked = currentUser ? await getLikeStatusFirebase(post.id, currentUser.uid) : false;
          const joined = currentUser ? await getJoinStatusFirebase(post.id, currentUser.uid) : false;
          const profile = await getUserProfileFirebase(post.authorId);
          return {
            id: post.id,
            authorId: post.authorId,
            user: post.username,
            avatar: profile?.avatar || "",
            time: post.createdAt,
            title: post.title,
            city: post.city,
            state: post.state,
            image: post.imageUrl || "",
            description: post.description,
            whenAt: post.whenAt,
            likes: post.likes ?? 0,
            comments: post.comments ?? 0,
            participants: post.participants ?? 0,
            liked: liked,
            joined: joined,
            zip: post.zip,
            neighborhood: post.neighborhood ?? null,
            locationName: post.locationName ?? null,
            location: post.location,
          };
        })
      );

      setPosts(formattedPosts);
      setFilteredPosts(formattedPosts);
    } catch (err: any) {
      setLoadError(err?.message || "Failed to load playdates");
    } finally {
      setLoading(false);
    }
  }, []);

  const hasLoaded = useRef(false);

  useEffect(() => {
    if (hasLoaded.current) return;
    hasLoaded.current = true;
    loadPlaydates();
  }, [loadPlaydates]);

  const goToProfile = (authorId: string) => (e: any) => {
    e.stopPropagation();
    router.push({
      pathname: "../userProfile",
      params: { authorId },
    });
  };

  const handleFabPress = () => {
    const user = getCurrentUser();

    if (!user) {
      Alert.alert("Not Logged In", "Please log in to post.");
      return;
    }

    setShowForm(true);
  };

  const isPin = selectedLocation
    ? isSpecificPlace(selectedLocation.types)
    : true;

  const dynamicRegion = selectedLocation
    ? isPin
      ? {
          latitude: selectedLocation.latitude,
          longitude: selectedLocation.longitude,
          latitudeDelta: 0.02,   // ✅ tight zoom for exact place
          longitudeDelta: 0.02,
        }
      : selectedLocation.viewport
      ? {
          latitude: selectedLocation.latitude,
          longitude: selectedLocation.longitude,
          ...getRegionFromViewport(selectedLocation.viewport), // ✅ zoom out for area
        }
      : {
          latitude: selectedLocation.latitude,
          longitude: selectedLocation.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }
    : undefined;

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await loadPlaydates();
    setRefreshing(false);
  }, [loadPlaydates]);

  function parseWhenAt(whenAt: string): Date {
    // Normalize all weird spaces to normal spaces
    const normalized = whenAt.replace(/\s+/g, " ").trim();
    // Example after normalize: "2025-12-07 12:00 PM"

    const [datePart, timePart, meridiem] = normalized.split(" ");

    if (!datePart || !timePart || !meridiem) {
      return new Date("invalid");
    }

    const [year, month, day] = datePart.split("-").map(Number);
    let [hour, minute] = timePart.split(":").map(Number);

    if (meridiem.toUpperCase() === "PM" && hour < 12) hour += 12;
    if (meridiem.toUpperCase() === "AM" && hour === 12) hour = 0;

    return new Date(year, month - 1, day, hour, minute);
  }

  function getHourDifference(now: Date, eventTime: Date) {
    // Only use hours of the day
    const nowHour = now.getHours();
    const eventHour = eventTime.getHours();

    // If event is on a later day, add 24h per day difference
    const dayDiff =
      new Date(eventTime.getFullYear(), eventTime.getMonth(), eventTime.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    const dayOffset = Math.round(dayDiff / (1000 * 60 * 60 * 24)); // whole days

    return eventHour - nowHour + dayOffset * 24;
  }

  function getEventBadge(whenAt: string) {
    const now = new Date();
    const eventTime = parseWhenAt(whenAt);

    if (isNaN(eventTime.getTime())) {
      return { label: "Invalid date", status: "completed" };
    }

    const diffMs = eventTime.getTime() - now.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHoursClock = getHourDifference(now, eventTime);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfEventDay = new Date(
      eventTime.getFullYear(),
      eventTime.getMonth(),
      eventTime.getDate()
    );

    const diffDays =
      Math.round(
        (startOfEventDay.getTime() - startOfToday.getTime()) /
          (1000 * 60 * 60 * 24)
      );

    const GRACE_HOURS = 2;
    const graceMs = GRACE_HOURS * 60 * 60 * 1000;

    // ✅ UPCOMING
    if (diffMs > 0) {
      if (diffMinutes < 60) {
        return { label: `In ${diffMinutes}m`, status: "upcoming" };
      }

      if (diffHoursClock < 24) {
        return { label: `In ${diffHoursClock}h`, status: "upcoming" };
      }

      if (diffDays === 1) {
        return { label: "Tomorrow", status: "upcoming" };
      }

      return { label: `In ${diffDays} days`, status: "upcoming" };
    }

    // ✅ ONGOING
    if (Math.abs(diffMs) <= graceMs) {
      return { label: "Ongoing", status: "ongoing" };
    }

    // ✅ RECENTLY ENDED
    const pastMinutes = Math.abs(diffMinutes);
    if (pastMinutes < 120) {
      return { label: `Ended ${pastMinutes}m ago`, status: "completed" };
    }

    // ✅ FULLY COMPLETED
    return { label: "Completed", status: "completed" };
  }

  const formattedDate = formData.date || "Select Date";

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
    >
      <View style={styles.container}>
        {!showForm && (
          <>
            <Text style={styles.header}>
              Paws up for your next park party!
            </Text>
            {loadError && (
              <Text
                style={{
                  textAlign: "center",
                  marginTop: 8,
                  color: "red",
                }}
              >
                {loadError}
              </Text>
            )}

            <View style={styles.searchContainer}>
              <View style={styles.searchBox}>
                <TextInput
                  placeholder="Enter city"
                  style={styles.searchInput}
                  value={formData.city}
                  onChangeText={(text) => handleInputChange("city", text)}
                  returnKeyType="search"
                  onSubmitEditing={handleSearch}
                />
                <TouchableOpacity
                  onPress={handleSearch}
                  style={styles.searchIcon}
                >
                  <Ionicons name="search" size={20} color="#888" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.dropdown}
                onPress={() => setModalVisible(true)}
              >
                <Text style={styles.dropdownText}>{selectedState} ▼</Text>
              </TouchableOpacity>
            </View>

            <Modal visible={modalVisible} transparent animationType="slide">
              <View style={styles.modalBackground}>
                <View style={styles.modalContent}>
                  <ScrollView>
                    {US_STATES.map((state) => (
                      <TouchableOpacity
                        key={state}
                        onPress={() => {
                          setSelectedState(state);
                          setModalVisible(false);
                        }}
                        style={styles.modalItem}
                      >
                        <Text style={styles.modalItemText}>{state}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TouchableOpacity
                    onPress={() => setModalVisible(false)}
                    style={styles.modalCancel}
                  >
                    <Text style={{ color: "red", fontWeight: "bold" }}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>

            <ScrollView
              style={styles.feed}
              contentContainerStyle={{ alignItems: "center" }}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4b2e83" />
              }
            >
              {filteredPosts.map((post) => (
                <TouchableOpacity
                  key={post.id}
                  style={[styles.card, { width: dynamicCardWidth }]}
                  onPress={() =>
                    router.push({pathname: "/playdatePost", params: {id: post.id}})
                  }
                >
                  <View style={styles.cardHeader}>
                    <TouchableOpacity activeOpacity={0.8} onPress={goToProfile(post.authorId)}>
                      <ExpoImage
                        source={{
                          uri:
                            post.avatar ||
                            "https://media.istockphoto.com/id/1444657782/vector/dog-and-cat-profile-logo-design.jpg?s=612x612&w=0&k=20&c=86ln0k0egBt3EIaf2jnubn96BtMu6sXJEp4AvaP0FJ0=",
                        }}
                        style={styles.profilePic}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                    </TouchableOpacity>

                    <View style={{ flex: 1 }}>
                      <TouchableOpacity activeOpacity={0.8} onPress={goToProfile(post.authorId)}>
                        <Text style={styles.username}>{post.user}</Text>
                      </TouchableOpacity>
                      <Text style={styles.time}>{timeAgo(post.time)}</Text>
                    </View>

                    {/* Join Section (Badge + Button) */}
                    {(() => {
                      const badge = getEventBadge(post.whenAt);
                      const isAuthor = getCurrentUser()?.uid === post.authorId;
                      const isCompleted = badge.status === "completed";
                      const isBlocked = isAuthor || isCompleted;

                      return (
                        <View style={{ alignItems: "center" }}>
                          {/* Participants Badge */}
                          <View style={styles.participantsBadge}>
                            <Text style={styles.participantsBadgeText}>
                              {post.participants === 0
                                ? "No one joined yet"
                                : post.participants === 1
                                  ? "1 person joined"
                                  : `${post.participants} people joined`}
                            </Text>
                          </View>

                          <TouchableOpacity
                            style={[
                              styles.joinButton,
                              {
                                backgroundColor: post.joined ? "#21bb61ff" : "#3498db",
                                opacity: isBlocked ? 0.5 : 1,
                              },
                            ]}
                            activeOpacity={0.8}
                            onPress={(e) => {
                              e.stopPropagation();
                              if (isBlocked) return;
                              toggleJoinPlaydate(post.id);
                            }}
                          >
                            <Text style={styles.joinButtonText}>
                              {isCompleted ? "Closed" : post.joined ? "Joined" : "Join"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })()}

                  </View>

                  <Text style={styles.cardTitle}>{post.title}</Text>
                  <Text style={styles.location}>
                    {post.city}, {post.state}
                  </Text>

                  {post.whenAt && (() => {
                    const badge = getEventBadge(post.whenAt);
                    return (
                      <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
                        <Text
                          style={[
                            styles.whenAt,
                            {
                              height: 24,       // same as badge
                              lineHeight: 24,   // match text vertical space to badge
                              marginBottom: 0,  // remove offset
                            },
                          ]}
                        >
                          {post.whenAt}
                        </Text>

                        <View
                          style={[
                            styles.badge,
                            badge.status === "upcoming" && styles.badgeUpcoming,
                            badge.status === "ongoing" && styles.badgeOngoing,
                            badge.status === "completed" && styles.badgeCompleted,
                            {
                              height: 24,          // same as text
                              justifyContent: "center",
                              alignItems: "center",
                              marginLeft: 6,       // optional spacing
                            },
                          ]}
                        >
                          <Text style={styles.badgeText}>{badge.label}</Text>
                        </View>
                      </View>
                    );
                  })()}

                  <Text
                    style={[
                      styles.description,
                      !post.image && { marginBottom: 6 },
                    ]}
                  >
                    {post.description}
                  </Text>

                  {post.image ? (
                    <ExpoImage
                      source={{ uri: post.image }}
                      style={styles.cardImage}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={200}
                    />
                  ) : null}

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginTop: 10,
                      gap: 14,
                    }}
                  >
                    {/* Like */}
                    <TouchableOpacity
                      onPress={() => {
                        if (likingMap[post.id]) return;
                        setLikingMap(prev => ({ ...prev, [post.id]: true }));
                        toggleLike(post.id).finally(() => setLikingMap(prev => ({ ...prev, [post.id]: false })));
                      }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                        opacity: likingMap[post.id] ? 0.5 : 1,
                      }}
                      disabled={!!likingMap[post.id]}
                    >
                      <Ionicons
                        name={post.liked ? "heart" : "heart-outline"}
                        size={20}
                        color={post.liked ? "red" : "#444"}
                      />
                      <Text>{post.likes}</Text>
                    </TouchableOpacity>

                    {/* Comment Count */}
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Ionicons
                        name="chatbubble-outline"
                        size={20}
                        color="#444"
                      />
                      <Text>{post.comments ?? 0}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.fab}
              onPress={handleFabPress}
            >
              <Ionicons name="add" size={32} color="white" />
            </TouchableOpacity>
          </>
        )}

        {showForm && (
          <ScrollView
            contentContainerStyle={styles.formContainer}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.formTitle}>Create a Playdate</Text>

            <Text style={styles.label}>Time:</Text>
            <TouchableOpacity
              onPress={() => setShowTimePicker(prev => !prev)}
              style={[styles.input, errors.time && styles.errorInput, { justifyContent: "center" }]}
            >
              <Text style={{ color: formData.time ? "#000" : "#999" }}>
                {formData.time || "Select Time"}
              </Text>
            </TouchableOpacity>

             <>    
            {/* Modal time picker */}
            <DateTimePickerModal
              isVisible={showTimePicker}
              mode="time"
              display="spinner" 
              onConfirm={(date) => {
                setSelectedTime(date);

                const formatted = date.toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true, // ensures AM/PM
                });

                handleInputChange("time", formatted);
                setShowTimePicker(false);
              }}
              onCancel={() => setShowTimePicker(false)}
            />
          </>

            <Text style={styles.label}>Date:</Text>

            <TouchableOpacity
              onPress={() => setShowDatePicker(true)}
              style={[styles.input, errors.date && styles.errorInput, { justifyContent: "center" }]}
            >
              <Text style={{ color: formData.date ? "#000" : "#999" }}>
                {formattedDate}
              </Text>
            </TouchableOpacity>

            <DateTimePickerModal
              isVisible={showDatePicker}
              mode="date"
              display="spinner"  
              minimumDate={new Date()}
              onConfirm={(date) => {
                setSelectedDate(date);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, "0");
                const day = String(date.getDate()).padStart(2, "0");
                const formatted = `${year}-${month}-${day}`;
                handleInputChange("date", formatted);
                setShowDatePicker(false);
              }}
              onCancel={() => setShowDatePicker(false)}
            />

            <Text style={styles.label}>Pet Breed:</Text>
            <TextInput
              style={[styles.input, errors.petBreed && styles.errorInput]}
              placeholder="e.g. Golden Retriever"
              value={formData.petBreed}
              onChangeText={(text) => handleInputChange("petBreed", text)}
            />

            <Text style={styles.label}>Pet Photo (optional):</Text>
            <TouchableOpacity
              style={styles.uploadButton}
              onPress={handlePickImage}
            >
              <Text style={styles.uploadButtonText}>
                {localImageUri ? "Change Photo" : "Upload Photo"}
              </Text>
            </TouchableOpacity>

            {localImageUri && (
              <Image source={{ uri: localImageUri }} style={styles.previewImage} />
            )}

            <Text style={styles.label}>Description (optional):</Text>
            <TextInput
              style={[styles.input, { height: 100, textAlignVertical: "top" }]}
              placeholder="Write something about your playdate..."
              value={formData.description}
              onChangeText={(text) => handleInputChange("description", text)}
              multiline
            />
                      <Text style={styles.label}>Playdate Location:</Text>
                      <TextInput
              style={styles.input}
              placeholder="Type park name or address"
              value={locationQuery}
              onChangeText={handleLocationInputChange}
            />

            {predictions.length > 0 && (
              <View style={{ maxHeight: 200, borderWidth: 1, borderColor: "#eee", borderRadius: 6 }}>
                {predictions.map((item) => (
                  <TouchableOpacity
                    key={item.place_id}
                    style={{ padding: 12, borderBottomWidth: 1, borderColor: "#eee" }}
                    onPress={() => onSelectPrediction(item)}
                  >
                    <Text>{item.description}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={[styles.button, { backgroundColor: '#E5F0FF', marginTop: 8 }]}
              onPress={geocodeLocation}
            >
              <Text style={styles.buttonText}>Select Location</Text>
            </TouchableOpacity>

            {selectedLocation && (
              <View
                style={{
                  marginTop: 10,
                  borderRadius: 8,
                  overflow: "hidden",
                  height: 200,
                }}
              >
                <MapView
                  style={{ flex: 1 }}
                  initialRegion={dynamicRegion}
                  region={dynamicRegion}
                  scrollEnabled={false}
                  zoomEnabled={false}
                >
                  {isSpecificPlace(selectedLocation.types) ? (
                    <Marker
                      coordinate={{
                        latitude: selectedLocation.latitude,
                        longitude: selectedLocation.longitude,
                      }}
                    />
                  ) : selectedLocation.viewport ? (
                    <Circle
                      center={{
                        latitude: selectedLocation.latitude,
                        longitude: selectedLocation.longitude,
                      }}
                      radius={getRadiusFromViewport(selectedLocation.viewport, selectedLocation.latitude)}
                      strokeWidth={1}
                      fillColor="rgba(0,122,255,0.15)"
                    />
                  ) : null}
                </MapView>
              </View>
            )}
            <TouchableOpacity
              style={[styles.button, { backgroundColor: "#F7D9C4" }]}
              onPress={handleSubmit}
            >
              <Text style={styles.buttonText}>Submit</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, { backgroundColor: "#DDB398" }]}
              onPress={() => setShowForm(false)}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  uploadButton: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#F2F2F2",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ccc",
  },
  uploadButtonText: {
    fontWeight: "600",
    color: "#333",
  },
  previewImage: {
    marginTop: 10,
    width: "100%",
    height: 200,
    borderRadius: 8,
    resizeMode: "cover",
  },
  container: { flex: 1, backgroundColor: "#f6f2e9" },
  header: {
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 40,
    color: "#4b2e83",
    letterSpacing: 0.6,
  },
  searchContainer: {
    flexDirection: "row",
    margin: 16,
    alignItems: "center",
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#f9f6ee",
    alignItems: "center",
    paddingHorizontal: 8,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#b7a57a",
  },
  searchInput: { flex: 1, paddingVertical: 6, color: "#1f1533" },
  searchIcon: { padding: 6 },
  dropdown: {
    backgroundColor: "#f9f6ee",
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginLeft: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#b7a57a",
    minHeight: 40,
    justifyContent: "center",
  },
  dropdownText: { color: "#4b2e83", fontWeight: "700" },
  modalBackground: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 12,
    maxHeight: "70%",
    padding: 10,
  },
  modalItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  modalItemText: { fontSize: 16 },
  modalCancel: { padding: 12, alignItems: "center" },
  feed: { flex: 1, paddingHorizontal: 16 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  profilePic: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    backgroundColor: "#e0e0e0",
    justifyContent: "center",
    alignItems: "center",
  },
  username: { fontWeight: "600", fontSize: 15 },
  time: { color: "#666", fontSize: 12 },
  cardTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginVertical: 6,
    lineHeight: 20,
    textAlign: "left",
  },
  location: {
    fontSize: 14,
    color: "#666",
    fontWeight: "600",
    marginBottom: 8,
  },
  cardImage: {
    width: "100%",
    height: undefined,
    aspectRatio: 4 / 3,
    borderRadius: 8,
    resizeMode: "cover",
    marginTop: 6,
  },
  description: {
    color: "#444",
    marginTop: 8,
    lineHeight: 20,
    textAlign: "left",
  },
  fab: {
    position: "absolute",
    bottom: 30,
    right: 30,
    backgroundColor: "#b7a57a",
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  formContainer: { flexGrow: 1, paddingBottom: 120, padding: 20 },
  formTitle: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  label: { fontSize: 16, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    marginTop: 5,
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  errorInput: { borderColor: "#FF6B6B" },
  button: {
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 16,
  },
  buttonText: { fontWeight: "bold", color: "#000" },
    joinButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    alignSelf: "center",
  },

  joinButtonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 13,
  },

  participantsBadge: {
    backgroundColor: "#FFE8D6",   // soft warm orange background
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    marginBottom: 6,
    alignSelf: "center",
  },

  participantsBadgeText: {
    color: "#F97316",             // vibrant orange text
    fontSize: 12,
    fontWeight: "600",
  },

  whenAt: {
  fontSize: 14,
  color: "#666",
  fontWeight: "600",
  height: 24,
  lineHeight: 24,
},

badge: {
  height: 24,
  paddingHorizontal: 6,
  borderRadius: 10,
  justifyContent: "center",
  alignItems: "center",
},

badgeUpcoming: { backgroundColor: "#2563EB" },
badgeOngoing: { backgroundColor: "#16A34A" },
badgeCompleted: { backgroundColor: "#6B7280" },

badgeText: {
  color: "#fff",
  fontSize: 12,
  fontWeight: "600",
}


});
