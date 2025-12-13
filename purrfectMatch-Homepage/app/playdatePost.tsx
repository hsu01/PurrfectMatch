import React, { useEffect, useState, useCallback, useLayoutEffect } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Platform,
  KeyboardAvoidingView,
  Modal,
  Alert,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from "react-native";
import { Image as ExpoImage } from 'expo-image';
import { useLocalSearchParams, useRouter, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  PlaydatePostFirebase,
  getPlaydateCommentsFirebase,
  addPlaydateCommentFirebase,
  deletePlaydateCommentFirebase,
  editPlaydateCommentFirebase,
  getPlaydatePostFirebase,
  getLikeStatusFirebase,
  toggleLikeFirebase,
  getJoinStatusFirebase,
  toggleJoinFirebase,
  getParticipantsFirebase,
  MiniProfile
} from "../api/playdates";
import { MapLocation } from "./(tabs)/PlayDate";
import { getCurrentUser, getUserProfileFirebase } from "../api/firebaseAuth";
import MapView, { Marker, Circle } from "react-native-maps";

export function timeAgo(date: Date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function PlaydatePost() {
  const params = useLocalSearchParams();

  const navigation = useNavigation();
  const postId = params.id as string | undefined;

  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<any[]>([]);
  const [loadingPost, setLoadingPost] = useState<boolean>(true);
  const [loadingComments, setLoadingComments] = useState(true);
  const [loadingMap, setLoadingMap] = useState(false);
  const [postAvatarUrl, setPostAvatarUrl] = useState<string | null>(null);
  const [authorEmail, setAuthorEmail] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [liked, setLiked] = useState<boolean>(false);
  const [joined, setJoined] = useState<boolean>(false);
  const [menuVisible, setMenuVisible] = useState<boolean>(false);
  const [selectedComment, setSelectedComment] = useState<string | null>(null);
  const [editing, setEditing] = useState<boolean>(false);
  const [editedContent, setEditedContent] = useState<string | null>(null);
  const [editHistoryModalVisible, setEditHistoryModalVisible] = useState<boolean>(false);
  const [selectedEdits, setSelectedEdits] = useState<string[] | null>(null);
  const [post, setPost] = useState<PlaydatePostFirebase | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [joining, setJoining] = useState<boolean>(false);
  const [participantsList, setParticipantsList] = useState<MiniProfile[] | null>(null);
  const [participantsModalVisible, setParticipantsModalVisible] = useState<boolean>(false);
  const [liking, setLiking] = useState<boolean>(false);

  const router = useRouter();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerStyle: { backgroundColor: '#4b2e83' },
      headerTintColor: '#f6f2e9',
      headerTitleStyle: { fontWeight: '800', color: '#f6f2e9' },
    });
  }, [navigation]);

  const loadPost = useCallback(async () => {
    if (!postId) return;

    try {
      setLoadingMap(true);
      const data = await getPlaydatePostFirebase(postId);
      if (data) setPost(data);
    } catch (err) {
      console.error("Failed to load post:", err);
    } finally {
      setLoadingMap(false);
    }
  }, [postId]);

  useEffect(() => {
    const fetchPostAndAvatar = async () => {
      setLoadingPost(true); // start loading

      try {
        // Load the post
        await loadPost();

        if (!post?.authorId) {
          setLoadingPost(false);
          return;
        }

        // Get author's profile
        const authorProfile = await getUserProfileFirebase(post.authorId);
        setPostAvatarUrl(authorProfile?.avatar || null);
        if (authorProfile?.publicEmail) {
          setAuthorEmail(authorProfile.email);
        }

        const currentUser = getCurrentUser();
        if (!currentUser || !postId) {
          setLoadingPost(false);
          return;
        }

        // Get current user's profile
        const profile = await getUserProfileFirebase(currentUser.uid);
        setAvatarUrl(profile?.avatar || null);

        // Fetch like/join status
        const liked = await getLikeStatusFirebase(postId, currentUser.uid);
        const joined = await getJoinStatusFirebase(postId, currentUser.uid);
        setLiked(liked);
        setJoined(joined);

      } catch (err) {
        console.error("Failed to fetch post/avatar/status:", err);
        setPostAvatarUrl(null);
      } finally {
        setLoadingPost(false); // done loading
      }
    };

    fetchPostAndAvatar();
  }, [loadPost, post?.authorId, postId]);

  const toggleJoinPlaydate = async () => {
    if (joining) return;
    setJoining(true);
    const currentUser = getCurrentUser();
    if (!currentUser) {
      Alert.alert("Not Logged In", "Please log in to join playdates.");
      setJoining(false);
      return;
    }

    try {
      if (!postId) return;
      // --- Optimistic update ---
      setPost(prev => {
        if (!prev) return prev; // if null, do nothing

        return {
          ...prev,
          participants: joined
            ? Math.max(0, prev.participants - 1)
            : prev.participants + 1,
        };
      });

      setJoined(!joined);

      // --- Firebase update ---
      await toggleJoinFirebase(postId, currentUser.uid);

      // --- Sync from Firebase ---
      //await loadPost();

    } catch (error) {
      console.error("Error toggling join:", error);
      Alert.alert("Error", "Failed to update join status. Please try again.");

      // --- Revert optimistic update ---
      await loadPost();
    } finally {
      setJoining(false);
    }
  };

  const toggleLike = async () => {
    if (liking) return;
    setLiking(true);
    const currentUser = getCurrentUser();
    if (!currentUser) {
      Alert.alert("Not Logged In", "Please log in to like posts.");
      setLiking(false);
      return;
    }

    try {
      if (!postId || !post) return;

      // --- Optimistic update ---
      setPost(prev => {
        if (!prev) return prev; // if null, do nothing

        return {
          ...prev,
          likes: liked ? Math.max(0, prev.likes - 1) : prev.likes + 1,
        };
      });

      setLiked(!liked)

      // --- Firebase update ---
      await toggleLikeFirebase(postId, currentUser.uid);

      // --- Sync from Firebase ---
      //await loadPost();

    } catch (error) {
      console.error("Error toggling like:", error);
      Alert.alert("Error", "Failed to update like status. Please try again.");

      // --- Revert optimistic update ---
      await loadPost();
    } finally {
      setLiking(false);
    }
  };

  const handleGetParticipants = async () => {
    if (!post?.id) return;

    try {
      const participants = await getParticipantsFirebase(post.id);
      setParticipantsList(participants);
      setParticipantsModalVisible(true);
    } catch (err) {
      console.error("Failed to get participants:", err);
    }
  };

  const loadComments = useCallback(async () => {
    if (!postId) return;
    setLoadingComments(true);
    const data = await getPlaydateCommentsFirebase(postId);
    const currentUser = getCurrentUser();
    const displayComments = await Promise.all(
      data.map(async (comment) => {
        const profile = await getUserProfileFirebase(comment.authorId);
        return {
          ...comment,
          avatar: profile?.avatar || "",
          yours: currentUser ? comment.authorId === currentUser.uid : false,
        };
      })
    );
    setComments(displayComments);
    setLoadingComments(false);
  },[postId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);
  const commentCount = Math.max(comments.length, post?.comments ?? 0);

  const handlePostComment = async () => {
    const currentUser = getCurrentUser();
    if (!postId || !comment.trim()) return;

    if (!currentUser) {
      Alert.alert('Not Logged In', 'Please log in to comment.');
      return;
    }

    try {
      // --- Optimistic Update (increase local comment count immediately) ---
      // setPost(prev => {
      //   if (!prev) return prev;

      //   return {
      //     ...prev,
      //     comments: (prev.comments || 0) + 1,
      //   };
      // });

      // --- Send to Firebase ---
      await addPlaydateCommentFirebase({
        postId: postId,
        authorId: currentUser.uid,
        username: currentUser.displayName || "User",
        content: comment.trim(),
      });

      // --- Clear input field ---
      setComment("");

      // --- Sync comments list ---
      await loadComments();
      await loadPost(); // refresh accurate count from Firebase

    } catch (error) {
      console.error("Error posting comment:", error);
      Alert.alert("Error", "Failed to post comment. Please try again.");

      // --- Revert optimistic update ---
      // await loadPost();
      // await loadComments();
    }
  };

  const handleMenuOption = async (option: "Edit" | "Delete") => {
    if (!postId) {
      Alert.alert("Error", "Post ID is missing.");
      return;
    }

    if (option === "Delete") {
      try {
        if (!selectedComment) {
          Alert.alert("Error", "No comment selected.");
          return;
        }

        if (deletingCommentId) {
          return;
        }

        setDeletingCommentId(selectedComment);

        // --- Optimistic Update (decrease comment count immediately) ---
        // setPost(prev => {
        //   if (!prev) return prev;

        //   return {
        //     ...prev,
        //     comments: Math.max(0, (prev.comments || 0) - 1),
        //   };
        // });

        // --- Firebase delete ---
        const response = await deletePlaydateCommentFirebase(selectedComment, postId);

        if (response.success) {
          // Refresh the comments list from Firebase
          await loadComments();
          await loadPost(); // ensure accurate count sync
          setSelectedComment(null);
          Alert.alert("Success", "Comment deleted successfully.");
        } else {
          Alert.alert("Error", "Failed to delete comment.");
          await loadPost(); // revert optimistic change
        }

      } catch (err) {
        console.error(err);
        Alert.alert("Error", "Failed to delete comment.");

        // --- Revert optimistic update ---
        await loadPost();
      } finally {
        setDeletingCommentId(null);
      }
    }

    if (option === "Edit") {
      setEditing(true);
    }

    setMenuVisible(false);
  };

  const handleEditComment = async () => {
    try {
      if (!selectedComment) {
        Alert.alert("Error", "No comment selected.");
        return;
      }
      if (!editedContent) {
        Alert.alert("Error", "Comment cannot be empty.");
        return;
      }

      const response = await editPlaydateCommentFirebase(selectedComment,editedContent);

      if (response.success) {
        loadComments();
        Alert.alert("Success", "Comment edited successfully.");
      } else {
        Alert.alert("Error", "Failed to edit comment.");
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to edit comment.");
    }
  };

  const openInMaps = async () => {
    const address = post?.location.address?.trim();
    if (!address) return;

    const encodedAddress = encodeURIComponent(address);

    const url =
      Platform.OS === "ios"
        ? `http://maps.apple.com/?q=${encodedAddress}`
        : Platform.OS === "android"
        ? `geo:0,0?q=${encodedAddress}`
        : `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        Linking.openURL(url);
      } else {
        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`);
      }
    } catch (e) {
      console.error("Failed to open maps:", e);
    }
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
      viewport: NonNullable<MapLocation["viewport"]>,
      centerLat: number
    ) => {
      const latDiff = Math.abs(viewport.northeast.lat - viewport.southwest.lat);
      const lngDiff = Math.abs(viewport.northeast.lng - viewport.southwest.lng);
  
      // Convert degrees → meters
      const latMeters = latDiff * 111_000;
      const lngMeters =
        lngDiff * 111_000 * Math.cos((centerLat * Math.PI) / 180);
  
      // Use diagonal and divide by 2 to get radius
      let radius = Math.sqrt(latMeters ** 2 + lngMeters ** 2) / 2.8;
  
      // ✅ Clamp radius to prevent absurd sizes
      radius = Math.min(Math.max(radius, 200), 25_000); // 200m–25km
  
      return radius;
    };
  
    const getRegionFromViewport = (
      viewport: NonNullable<MapLocation["viewport"]>
    ) => {
      const latitudeDelta =
        Math.abs(viewport.northeast.lat - viewport.southwest.lat) * 1.5; // padding
      const longitudeDelta =
        Math.abs(viewport.northeast.lng - viewport.southwest.lng) * 1.5;
      
      return { latitudeDelta, longitudeDelta };
    };

  const isPin = post?.location
    ? isSpecificPlace(post.location.types)
    : true;

  const dynamicRegion = post?.location
    ? isPin
      ? {
          latitude: post.location.latitude,
          longitude: post.location.longitude,
          latitudeDelta: 0.02,   // ✅ tight zoom for exact place
          longitudeDelta: 0.02,
        }
      : post.location.viewport
      ? {
          latitude: post.location.latitude,
          longitude: post.location.longitude,
          ...getRegionFromViewport(post.location.viewport), // ✅ zoom out for area
        }
      : {
          latitude: post.location.latitude,
          longitude: post.location.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }
    : undefined;

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

  if (loadingPost) {
    return (
      <View style={styles.fullScreenLoading}>
        <Image
          source={{
            uri: 'https://media.istockphoto.com/id/1444657782/vector/dog-and-cat-profile-logo-design.jpg?s=612x612&w=0&k=20&c=86ln0k0egBt3EIaf2jnubn96BtMu6sXJEp4AvaP0FJ0=',
          }}
          style={styles.loadingImage}
        />
        <ActivityIndicator size="large" color="#3498db" style={styles.loadingSpinner} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <TouchableOpacity onPress={() => router.push({ pathname: "/userProfile", params: { authorId: post?.authorId } })}>
              <ExpoImage
                source={{ uri: postAvatarUrl || 'https://media.istockphoto.com/id/1444657782/vector/dog-and-cat-profile-logo-design.jpg?s=612x612&w=0&k=20&c=86ln0k0egBt3EIaf2jnubn96BtMu6sXJEp4AvaP0FJ0=' }}
                style={styles.profilePic}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <TouchableOpacity onPress={() => router.push({ pathname: "/userProfile", params: { authorId: post?.authorId } })}>
                <Text style={styles.username}>{post?.username}</Text>
              </TouchableOpacity>
              <Text style={styles.time}>{timeAgo(post?.createdAt ?? new Date())}</Text>
            </View>
            {/* Join Section (Badge + Button) */}
            {post && (() => {
              const badge = getEventBadge(post.whenAt);
              const isAuthor = getCurrentUser()?.uid === post.authorId;
              const isCompleted = badge.status === "completed";
              const isBlocked = isAuthor || isCompleted || joining;

              return (
                <View style={{ alignItems: "center" }}>
                  {/* Participants Badge */}
                  <TouchableOpacity onPress={handleGetParticipants}>
                    <View style={styles.participantsBadge}>
                      <Text style={styles.participantsBadgeText}>
                        {post.participants === 0
                          ? "No one joined yet"
                          : post.participants === 1
                            ? "1 person joined"
                            : `${post.participants} people joined`}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.joinButton,
                      joined && styles.joinButtonJoined,
                      isCompleted && styles.joinButtonClosed,
                      isBlocked && styles.joinButtonDisabled,
                    ]}
                    activeOpacity={0.9}
                    onPress={(e) => {
                      e.stopPropagation();
                      if (isBlocked) return;
                      toggleJoinPlaydate();
                    }}
                  >
                    <Text style={styles.joinButtonText}>
                      {joining
                        ? "Joining..."
                        : isCompleted
                          ? "Closed"
                          : joined
                            ? "Joined"
                            : "Join"}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })()}

          </View>

          <Text style={styles.title}>{post?.title}</Text>
          <Text style={styles.subtitle}>{post?.locationName}</Text>
          {post?.whenAt && (() => {
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

          {/* --- DESCRIPTION --- */}
          <Text style={styles.description}>
            {post?.description ?? ''}

            {post?.edits && post.edits.length > 0 && (
              <Text
                onPress={() => {
                  setSelectedEdits(post.edits ?? []);
                  setEditHistoryModalVisible(true);
                }}
                style={{ color: "#666", fontSize: 10, marginLeft: 4 }}
              >
                (edited)
              </Text>
            )}
          </Text>

          {post?.imageUrl && (
            <ExpoImage
              source={{ uri: post.imageUrl }}
              style={styles.image}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
            />
          )}

          {/* --- LOCATION / MAP --- */}
          <View style={{ marginTop: 12 }}>
            {loadingMap && <Text style={{ color: "#666" }}>Loading map...</Text>}

            {post?.location && (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={openInMaps}
                style={styles.mapTouchable}
              >
                <MapView
                  style={{ flex: 1 }}
                  initialRegion={dynamicRegion}
                  region={dynamicRegion}
                  scrollEnabled={false}
                  zoomEnabled={false}
                >
                  {isSpecificPlace(post.location.types ?? []) ? (
                    <Marker
                      coordinate={{
                        latitude: post.location.latitude ?? 0,
                        longitude: post.location.longitude ?? 0,
                      }}
                    />
                  ) : post.location.viewport ? (
                    <Circle
                      center={{
                        latitude: post.location.latitude,
                        longitude: post.location.longitude,
                      }}
                      radius={getRadiusFromViewport(
                        post.location.viewport,
                        post.location.latitude
                      )}
                      strokeWidth={1}
                      fillColor="rgba(0,122,255,0.15)"
                    />
                  ) : null}
                </MapView>

                <View style={styles.mapBadge}>
                  <Ionicons name="navigate-outline" size={14} color="#fff" />
                  <Text style={styles.mapBadgeText}>Open in Maps</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>

          {/* --- CONTACT INFO --- */}
          <Text style={[styles.description, { marginTop: 12 }]}>
            <Text style={{ color: "#555" }}>
              Contact info: {authorEmail ? authorEmail : "Unavailable"}
            </Text>
          </Text>

          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, gap: 14 }}>
            {/* Like */}
            <TouchableOpacity
              onPress={() => toggleLike()}
              style={{ flexDirection: "row", alignItems: "center", gap: 4}}
            >
              <Ionicons name={liked ? "heart" : "heart-outline"} size={20} color={liked ? "red" : "#444"}/>
              <Text>{Math.max(0, post?.likes ?? 0)}</Text>
            </TouchableOpacity>

            {/* Comment Count */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4}}>
              <Ionicons name="chatbubble-outline" size={20} color="#444"/>
              <Text>{commentCount}</Text>
            </View>
          </View>
        </View>

        {/* ⭐ COMMUNITY-STYLE COMMENT BAR (FINAL VERSION) ⭐ */}
        <View style={styles.commentRow}>
          <Image
            source={{ uri: avatarUrl || 'https://media.istockphoto.com/id/1444657782/vector/dog-and-cat-profile-logo-design.jpg?s=612x612&w=0&k=20&c=86ln0k0egBt3EIaf2jnubn96BtMu6sXJEp4AvaP0FJ0=' }}
            style={styles.commentProfile}
          />

          <View style={styles.commentBubble}>
            <TextInput
              style={styles.commentInput}
              placeholder="Write a comment..."
              value={comment}
              onChangeText={setComment}
            />
          </View>

          <TouchableOpacity style={styles.postButton} onPress={handlePostComment}>
            <Text style={{ color: "#fff", fontWeight: "600" }}>Post</Text>
          </TouchableOpacity>
        </View>

        {/* COMMENTS LIST */}
        <View style={{ marginTop: 20 }}>
          {loadingComments ? (
            <Text style={{ color: "#666" }}>Loading comments...</Text>
          ) : comments.length === 0 ? (
            <Text style={{ color: "#666" }}>No comments yet — be the first!</Text>
          ) : (
            comments.map((c) => (
              <View key={c.id} style={styles.commentItem}>
                <TouchableOpacity onPress={() => router.push({ pathname: "/userProfile", params: { authorId: c.authorId } })}>
                  <Image
                    source={{ uri: c.avatar || 'https://media.istockphoto.com/id/1444657782/vector/dog-and-cat-profile-logo-design.jpg?s=612x612&w=0&k=20&c=86ln0k0egBt3EIaf2jnubn96BtMu6sXJEp4AvaP0FJ0=' }}
                    style={styles.commentProfile}
                  />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    <TouchableOpacity onPress={() => router.push({ pathname: "/userProfile", params: { authorId: c.authorId } })}>
                      <Text style={styles.commentUsername}>{c.username}</Text>
                    </TouchableOpacity>
                    <Text style={styles.commentTime}>{timeAgo(c.createdAt)}</Text>
                    
                  </View>
                  {/* Editing view */}
                  {editing && selectedComment === c.id ? (
                    <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center" }}>
                      <TextInput
                        value={editedContent ?? c.content}
                        onChangeText={setEditedContent}
                        style={{
                          flex: 1,
                          borderWidth: 1,
                          borderColor: "#ccc",
                          borderRadius: 6,
                          padding: 8
                        }}
                        multiline
                      />

                      <TouchableOpacity
                        onPress={() => {
                          handleEditComment();
                          setEditing(false);
                          setEditedContent(null);
                          setSelectedComment(null);
                        }}
                        style={{ marginLeft: 8 }}
                      >
                        <Text style={{ color: "#007aff", fontWeight: "700" }}>Save</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    /* Normal non-editing text */
                    <Text style={{ marginTop: 4 }}>
                      {c.content}
                      {c.edits && c.edits.length > 0 && (
                        <Text
                          onPress={() => {
                            setSelectedComment(c.id);
                            setSelectedEdits(c.edits ?? []);
                            setEditHistoryModalVisible(true);
                          }}
                          style={{ color: "#666", fontSize: 10}}
                        >
                          (edited)
                        </Text>
                      )}
                    </Text>
                  )}

                </View>
                {/* "..." menu button ONLY for your comments */}
                {c.yours && (
                  <TouchableOpacity
                    style={[styles.postMenuButton, deletingCommentId ? { opacity: 0.5 } : null]}
                    disabled={!!deletingCommentId}
                    onPress={() => {
                      setMenuVisible(true);
                      setSelectedComment(c.id);
                    }}
                  >
                    <Text style={styles.postMenuText}>⋮</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
          {/* Modal for menu options */}
          <Modal
            visible={menuVisible}
            transparent
            onRequestClose = {() => setMenuVisible(false)}
          >
            <TouchableOpacity style={styles.modalOverlay} onPress={() => setMenuVisible(false)}>
              <View style={styles.modalContent}>
                {["Edit", "Delete"].map((option) => (
                  <TouchableOpacity
                    key={option}
                    onPress={() => handleMenuOption(option as "Edit" | "Delete" )}
                    style={[
                      styles.modalOption,
                      option === "Delete" && deletingCommentId ? { opacity: 0.5 } : null
                    ]}
                    disabled={option === "Delete" && !!deletingCommentId}
                  >
                    <Text style={styles.modalOptionText}>
                      {option === "Delete" && deletingCommentId ? "Deleting..." : option}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableOpacity>
          </Modal>

          {/* Modal for edit history */}
          <Modal
            visible={editHistoryModalVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setEditHistoryModalVisible(false)}
          >
            <TouchableWithoutFeedback onPress={() => setEditHistoryModalVisible(false)}>
              <View
                style={{
                  flex: 1,
                  backgroundColor: "rgba(0,0,0,0.5)",
                  justifyContent: "center",
                  padding: 20,
                }}
              >
                <TouchableWithoutFeedback>
                  <View
                    style={{
                      backgroundColor: "#fff",
                      borderRadius: 10,
                      padding: 20,
                      maxHeight: "70%",
                    }}
                  >
                    <ScrollView>
                      {selectedEdits?.map((text, idx) => (
                        <View
                          key={idx}
                          style={{
                            backgroundColor: "#f7f7f7",
                            padding: 12,
                            borderRadius: 8,
                            marginBottom: 12,
                          }}
                        >
                          <Text style={{ color: "#444" }}>{text}</Text>
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                </TouchableWithoutFeedback>
              </View>
            </TouchableWithoutFeedback>
          </Modal>

          {/* Modal for viewing participants */}
          <Modal visible={participantsModalVisible} transparent animationType="slide">
            <TouchableWithoutFeedback onPress={() => setParticipantsModalVisible(false)}>
              <View style={styles.participantsModalOverlay}>
                <TouchableWithoutFeedback>
                  <View style={styles.participantsModalContent}>
                    <Text style={styles.participantsModalTitle}>Participants</Text>
                    <ScrollView style={styles.participantsModalList}>
                      {participantsList?.map((participant) => (
                        <TouchableOpacity
                          key={participant.id}
                          style={styles.participantsModalItem}
                          activeOpacity={0.7}
                          onPress={() => {
                            if (Platform.OS === 'ios') {
                              setParticipantsModalVisible(false);
                            }

                            router.push({
                              pathname: '/userProfile',
                              params: { authorId: participant.id },
                            });
                          }}
                        >
                          <Image
                            source={{ uri: participant.avatar || 'https://media.istockphoto.com/id/1444657782/vector/dog-and-cat-profile-logo-design.jpg?s=612x612&w=0&k=20&c=86ln0k0egBt3EIaf2jnubn96BtMu6sXJEp4AvaP0FJ0=' }}
                            style={{ width: 40, height: 40, borderRadius: 20 }}
                          />
                          <Text style={styles.participantsModalItemText}>
                            {participant.username || "Unknown"}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </TouchableWithoutFeedback>
              </View>
            </TouchableWithoutFeedback>
          </Modal>

        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: "#f6f2e9" },

  card: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    shadowColor: "#4b2e83",
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    borderWidth: 1,            // adds border
    borderColor: "rgba(75,46,131,0.2)",       // light gray border
  },

  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },

  profilePic: { width: 40, height: 40, borderRadius: 20, marginRight: 10 },

  username: { fontWeight: "600", fontSize: 15 },
  time: { color: "#5a4b6b", fontSize: 12 },

  title: { fontSize: 20, fontWeight: "bold", marginBottom: 6 },
  subtitle: { fontSize: 14, color: "#4b2e83", marginBottom: 4 },

  image: {
    width: "100%",
    height: 220,
    borderRadius: 12,
    marginVertical: 12,
    resizeMode: "cover",
  },

  description: {
    marginTop: 10,
    fontSize: 15,
    color: "#333",
    marginBottom: 10,
    lineHeight: 20,
  },

  /* ⭐ FINAL COMMUNITY COMMENT BAR ⭐ */
  commentRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    gap: 10,
  },

  commentBubble: {
    flex: 1,
    backgroundColor: "#f9f6ee",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbb89f",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  commentProfile: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#ddd",
  },

  commentInput: {
    fontSize: 15,
  },

  postButton: {
    backgroundColor: "#4b2e83",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
  },

  commentItem: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: "#eee",
  },

  commentUsername: { fontWeight: "600", fontSize: 14 },
  commentTime: { color: "#888", fontSize: 12 },
  commentContent: { fontSize: 14, marginTop: 2, color: "#1f1533" },

  map: {
    width: "100%",
    height: 160,
    borderRadius: 10,
    marginBottom: 10,
  },
  mapTouchable: { marginTop: 10, borderRadius: 12, overflow: "hidden", height: 200 },

  mapBadge: {
    position: "absolute",
    right: 10,
    bottom: 15,
    backgroundColor: "#4b2e83",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  mapBadgeText: {
    color: "#f6f2e9",
    fontSize: 11,
    fontWeight: "700",
  },
  postMenuButton: {
    position: 'absolute',
    right: 8,
    zIndex: 10,
    padding: 4,
  },

  postMenuText: {
    fontSize: 18,
    fontWeight: '600',
  },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", alignItems: "center" },
  modalContent: { backgroundColor: "#fff", borderRadius: 8, width: 200 },
  modalOption: { padding: 12, borderBottomWidth: 1, borderBottomColor: "#eee" },
  modalOptionText: { fontSize: 16 },

  joinButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    alignSelf: "center",
    backgroundColor: "#4b2e83",
    borderWidth: 1,
    borderColor: "#b7a57a",
  },

  joinButtonText: {
    color: "#f6f2e9",
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 0.2,
  },

  joinButtonJoined: {
    backgroundColor: "#1f9a5b",
    borderColor: "#0f6b3a",
  },

  joinButtonClosed: {
    backgroundColor: "#a39e9e",
    borderColor: "#7c7777",
  },

  joinButtonDisabled: {
    opacity: 0.6,
  },

  participantsBadge: {
    backgroundColor: "#ebe3d0",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 6,
    alignSelf: "center",
    borderWidth: 1,
    borderColor: "#b7a57a",
  },

  participantsBadgeText: {
    color: "#4b2e83",
    fontSize: 12,
    fontWeight: "700",
  },

  participantsModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)", // slightly darker overlay
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },

  participantsModalContent: {
    backgroundColor: "#fff",
    borderRadius: 12,
    width: "100%", // responsive width
    maxHeight: "70%", // avoid taking full screen
    paddingVertical: 16,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5, // for Android shadow
  },

  participantsModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
    textAlign: "center",
    marginBottom: 12,
  },

  participantsModalList: {
    // For scrollable list
    maxHeight: 300,
  },

  participantsModalItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },

  participantsModalItemText: {
    fontSize: 16,
    color: "#000000ff",
    marginLeft: 10,
  },

  fullScreenLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff', // or semi-transparent like 'rgba(255,255,255,0.9)'
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999, // ensure it sits on top
  },
  loadingImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 20,
  },
  loadingSpinner: {
    marginTop: 10,
  },
  whenAt: {
    fontSize: 14,
    color: "#4b2e83",
    height: 24,
    lineHeight: 24,
  },

  badge: {
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ebe3d0",
    borderWidth: 1,
    borderColor: "#b7a57a",
  },

  badgeUpcoming: { backgroundColor: "#e3d8ff", borderColor: "#4b2e83" },
  badgeOngoing: { backgroundColor: "#d9f3e7", borderColor: "#1f9a5b" },
  badgeCompleted: { backgroundColor: "#ece7dc", borderColor: "#a39e9e" },

  badgeText: {
    color: "#1f1533",
    fontSize: 12,
    fontWeight: "700",
  }

});
