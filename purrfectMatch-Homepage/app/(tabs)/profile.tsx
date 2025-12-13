import { useRouter } from 'expo-router';
import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View, Alert, ActivityIndicator, Platform, ScrollView, Image, Switch, Modal } from 'react-native';
import { loginFirebase, logoutFirebase, getCurrentUser, setUserProfileFirebase, getUserProfileFirebase, ProfileFirebase, updateProfileFirebase} from '../../api/firebaseAuth';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../config/firebase';
import { listCommunityPostsFirebase, CommunityPostFirebase, deleteCommunityPostFirebase, editCommunityPostFirebase } from '../../api/community';
import { listPlaydatesFirebase, PlaydatePostFirebase, deletePlaydatePostFirebase, editPlaydatePostFirebase, getJoinedPlaydatesFirebase } from '../../api/playdates';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

export default function Profile() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [userPosts, setUserPosts] = useState<(CommunityPostFirebase & { id: string; type: 'community' })[]>([]);
  const [userPlaydates, setUserPlaydates] = useState<PlaydatePostFirebase[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [profile, setProfile] = useState<ProfileFirebase | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(false);
  const [editedName, setEditedName] = useState<string>("");
  const [editedBio, setEditedBio] = useState<string>("");
  const [emailIsPublic, setEmailIsPublic] = useState<boolean>(false);
  const [menuVisible, setMenuVisible] = useState<boolean>(false);
  const [selectedPost, setSelectedPost] = useState<{postId: string; type: 'community' | 'playdate'} | null>(null);
  const [isEditingPost, setIsEditingPost] = useState<boolean>(false);
  const [editedPostDescription, setEditedPostDescription] = useState<string | null>(null);
  const [joinedPlaydates, setJoinedPlaydates] = useState<PlaydatePostFirebase[]>([]);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const router = useRouter();

  const loadUserPosts = useCallback(async () => {
    const currentUser = getCurrentUser();
    setLoadingPosts(true);
    try {
      if (!currentUser) return;
      // Fetch community posts
      const allCommunityPosts = await listCommunityPostsFirebase();
      const userCommunityPosts = allCommunityPosts
        .filter(post => post.authorId === currentUser.uid)
        .map(post => ({ ...post, type: 'community' as const }));

      // Fetch playdates
      const allPlaydates = await listPlaydatesFirebase();
      const userPlaydatePosts = allPlaydates.filter(post => post.authorId === currentUser.uid);

      const joinedPlaydates = await getJoinedPlaydatesFirebase(currentUser.uid);

      setJoinedPlaydates(joinedPlaydates);
      setUserPosts(userCommunityPosts);
      setUserPlaydates(userPlaydatePosts);
      console.log(`Loaded ${userCommunityPosts.length} community posts and ${userPlaydatePosts.length} playdates`);
    } catch (error) {
      console.error('Error loading user posts:', error);
    } finally {
      setLoadingPosts(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoadingAuth(true);

      try {
        if (user) {
          setIsLoggedIn(true);
          console.log('User logged in:', user.email);

          const currProfile = await getUserProfileFirebase(user.uid);

          if (!currProfile) {
            // Create missing profile
            const result = await setUserProfileFirebase(user.uid, {
              email: user.email!,
              username: user.displayName || "User",
              name: "",
              bio: "",
              avatar: 'https://media.istockphoto.com/id/1444657782/vector/dog-and-cat-profile-logo-design.jpg?s=612x612&w=0&k=20&c=86ln0k0egBt3EIaf2jnubn96BtMu6sXJEp4AvaP0FJ0=',
              publicEmail: false,
            });

            if (!result.success) {
              console.error("Failed to create user profile. Account exists without profile?");
            }
          }

          // Fetch the newly created profile
          const finalProfile = await getUserProfileFirebase(user.uid);
          setProfile(finalProfile);
          setEditedName(finalProfile?.name || "");
          setEditedBio(finalProfile?.bio || "");
          setEmailIsPublic(finalProfile?.publicEmail || false);

          await loadUserPosts();
        } else {
          // User logged out
          setIsLoggedIn(false);
          setUserPosts([]);
          setUserPlaydates([]);
          setProfile(null);
          setEditedName("");
          setEditedBio("");
          setEmailIsPublic(false);
          console.log('User logged out');
        }
      } catch (error) {
        console.error("Error in auth state change:", error);
      } finally {
        setLoadingAuth(false); // ✅ always runs
      }
    });

    return () => unsubscribe();
  }, [loadUserPosts]);

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alert('Permission needed to access photos');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1.0,
    });

    const currentUser = getCurrentUser();

    if (!result.canceled) {
      const asset = result.assets[0];
      const localUri = asset.uri;

      const response = await fetch(localUri);
      const blob = await response.blob();

      const storage = getStorage();
      const storageRef = ref(storage, `avatars/${currentUser?.uid}.jpg`);
      await uploadBytes(storageRef, blob);

      const downloadURL = await getDownloadURL(storageRef);

      await setUserProfileFirebase(currentUser!.uid, {
        ...profile!,
        avatar: downloadURL,
      });

      setProfile({
        ...profile!,
        avatar: downloadURL,
      });
    }
  };

  useFocusEffect(
    useCallback(() => {
      console.log('Screen focused, refreshing posts...');
      loadUserPosts();
    }, [loadUserPosts])
  );

  const handleLogIn = async () => {
    setErrorMessage(null);
    
    if (!email || !password) {
      setErrorMessage('Please fill out both fields');
      return;
    }

    setLoading(true);

    try {
      console.log('Attempting Firebase login...');
      const result = await loginFirebase({ email, password });

      if (result.ok) {
        console.log('Login successful');
        if (Platform.OS === 'web') {
          alert('Signed in successfully');
          router.replace('/');
        } else {
          Alert.alert('Success', 'Signed in successfully');
        }
      } else {
        console.log('Login failed:', result.message);
        setErrorMessage(result.message || 'Login failed');
      }
    } catch (error) {
      console.error('Login error:', error);
      setErrorMessage('Could not connect to Firebase');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logoutFirebase();
    setEmail('');
    setPassword('');
    setErrorMessage(null);
    
    if (Platform.OS === 'web') {
      alert('You have been signed out.');
    } else {
      Alert.alert('Logged out', 'You have been signed out.');
    }
  };

  const handleSaveProfile = async (name: string, bio: string) => {
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) return;
      await updateProfileFirebase(currentUser.uid, {
        name: name.trim(),
        bio: bio.trim(),
        publicEmail: emailIsPublic,
      });
      setProfile(prev => prev ? { ...prev, name, bio } : prev);
      console.log("Profile saved!");
    } catch (e) {
      console.error("Failed to update profile:", e);
    }
  };

  const handleMenuOption = async (option: "Edit" | "Delete") => {
    if (!selectedPost) return;
    console.log(`${option} clicked for post: ${selectedPost.postId}`);

    if (option === "Delete") {
      // Map post types to delete functions
      const deleteActions: Record<string, (id: string) => Promise<any>> = {
        community: deleteCommunityPostFirebase,
        playdate: deletePlaydatePostFirebase,
      };

      const deleteFn = deleteActions[selectedPost.type];
      if (!deleteFn) {
        Alert.alert("Error", "Unknown post type.");
        return;
      }

      try {
        const response = await deleteFn(selectedPost.postId);

        if (response.success) {
          loadUserPosts();
          Alert.alert("Success", "Post deleted successfully.");
        } else {
          Alert.alert("Error", "Failed to delete post.");
        }
      } catch (err) {
        console.error(err);
        Alert.alert("Error", "Failed to delete post.");
      }
    }
    if (option === "Edit") {
      console.log(isEditingPost);
      setIsEditingPost(true);
    }
    setMenuVisible(false);
  };

  const handleEditPostDescription = async () => {
    try {
      if (!selectedPost) {
        Alert.alert("Error", "No post selected.");
        return;
      }
      if (!editedPostDescription) {
        Alert.alert("Error", "Post cannot be empty.");
        return;
      }

      const editActions: Record<string, (id: string, text: string) => Promise<any>> = {
        community: editCommunityPostFirebase,
        playdate: editPlaydatePostFirebase,
      };

      const editFn = editActions[selectedPost.type];
      if (!editFn) {
        Alert.alert("Error", "Unknown post type.");
        return;
      }

      const response = await editFn(selectedPost.postId, editedPostDescription);

      if (response.success) {
        loadUserPosts();
        Alert.alert("Success", "Post edited successfully.");
      } else {
        Alert.alert("Error", "Failed to edit post.");
      }

    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to edit post.");
    }
  };

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

  if (!isLoggedIn) {
    return (
      <View style={styles.container}>
        <View style={styles.login}>
          <Text style={styles.title}>Login</Text>

          {errorMessage && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
            </View>
          )}

          <Text style={styles.account_create}>Email</Text>
          <TextInput
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setErrorMessage(null); // Clear error when typing
            }}
            placeholder="e.g., user@example.com"
            placeholderTextColor="#888"
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />

          <Text style={styles.account_create}>Password</Text>
          <TextInput
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setErrorMessage(null); // Clear error when typing
            }}
            placeholder="Enter password"
            placeholderTextColor="#888" 
            style={styles.input}
            autoCapitalize="none"
            secureTextEntry={true}
          />

          <TouchableOpacity
            onPress={() => { router.push('../forgotPassword') }}
            style={{ alignSelf: 'flex-end', marginBottom: 20 }}>
            <Text style={styles.forgot_password}>Forgot password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.login_button}
            disabled={loading}
            onPress={handleLogIn}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '600' }}>LOGIN</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.create_an_account}>Or create an account</Text>

          <TouchableOpacity
            onPress={() => { router.push('../signup') }}
            style={{ alignSelf: 'center', marginBottom: 20 }}>
            <Text style={styles.signup_text}>SIGN UP</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="always">
      <View style={styles.profileHeader}>
        <View style={styles.avatarContainer}>
          <TouchableOpacity onPress={handlePickImage}>
            <Image
              source={{ uri: profile?.avatar }}
              style={styles.profilePic}
            />
            <View style={styles.cameraOverlay}>
              <MaterialIcons name="camera" size={20} color="#fff" />
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.username}>{getCurrentUser()?.displayName}</Text>
        <Text style={styles.email}>{getCurrentUser()?.email}</Text>
        
        {/* show number of posts (playdate, community) */}
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{userPosts.length}</Text>
            <Text style={styles.statLabel}>Posts</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{userPlaydates.length}</Text>
            <Text style={styles.statLabel}>Playdates</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{userPosts.length + userPlaydates.length}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>LOGOUT</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.profileInfoBox}>
        {/* Name */}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Name</Text>

          {isEditingProfile ? (
            <TextInput
              style={styles.inputField}
              value={editedName}
              onChangeText={setEditedName}
              placeholder="Enter your name"
            />
          ) : (
            <Text style={styles.infoValue}>
              {profile?.name ? profile.name : "Not set"}
            </Text>
          )}
          <View style={styles.infoDivider} />
        </View>

        {/* Email */}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Email</Text>

          {isEditingProfile ? (
            // Show toggle when editing
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={styles.infoValue}>
                {emailIsPublic ? "Public" : "Private"}
              </Text>

              <Switch
                value={emailIsPublic}
                onValueChange={(value: boolean) => setEmailIsPublic(value)}
              />
            </View>
          ) : (
            // Normal view mode
            <Text style={styles.infoValue}>
              {emailIsPublic ? "Public" : "Private"}
            </Text>
          )}

          <View style={styles.infoDivider} />
        </View>

        {/* Bio */}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Bio</Text>

          {isEditingProfile ? (
            <TextInput
              style={[styles.inputField, { height: 80 }]}
              value={editedBio}
              onChangeText={setEditedBio}
              placeholder="Enter your bio"
              multiline
            />
          ) : (
            <Text style={styles.infoValue}>
              {profile?.bio ? profile.bio : "Not set"}
            </Text>
          )}
        </View>

        {/* Edit / Save button */}
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => {
            if (isEditingProfile) {
              // Apply changes here
              handleSaveProfile(editedName, editedBio);
            }
            setIsEditingProfile(prev => !prev);
          }}
        >
          <Text style={styles.editButtonText}>
            {isEditingProfile ? "Apply Changes" : "Edit"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Joined Playdates Section */}
      <View style={styles.postsSection}>
        {(() => {
          // filter OUT completed playdates
          const activeJoinedPlaydates = joinedPlaydates.filter(
            (p) => getEventBadge(p.whenAt).status !== "completed"
          );

          return (
            <>
              <Text style={styles.sectionTitle}>
                Joined Playdates ({activeJoinedPlaydates.length})
              </Text>

              {activeJoinedPlaydates.length > 0 && (
                <View style={styles.postTypeSection}>
                  {activeJoinedPlaydates.map((playdate) => {
                    const badge = getEventBadge(playdate.whenAt);

                    return (
                      <TouchableOpacity
                        key={playdate.id}
                        activeOpacity={0.8}
                        onPress={() =>
                          router.push({
                            pathname: "/playdatePost",
                            params: { id: playdate.id },
                          })
                        }
                      >
                        <View style={styles.postCard}>
                          <Text style={styles.playdateTitle}>{playdate.title}</Text>

                          <View style={styles.playdateInfo}>
                            <Text style={styles.playdateLabel}>{playdate.dogBreed}</Text>
                            <Text style={styles.playdateLabel}>
                              {playdate.city}, {playdate.state}
                            </Text>
                          </View>

                          <Text style={styles.postDescription}>{playdate.description}</Text>

                          <View style={styles.playdateDetails}>
                            {playdate.whenAt &&
                              (() => (
                                <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
                                  <Text
                                    style={[
                                      styles.whenAt,
                                      {
                                        height: 24,
                                        lineHeight: 24,
                                        marginBottom: 0,
                                      },
                                    ]}
                                  >
                                    {playdate.whenAt}
                                  </Text>

                                  <View
                                    style={[
                                      styles.badge,
                                      badge.status === "upcoming" && styles.badgeUpcoming,
                                      badge.status === "ongoing" && styles.badgeOngoing,
                                      {
                                        height: 24,
                                        justifyContent: "center",
                                        alignItems: "center",
                                        marginLeft: 6,
                                      },
                                    ]}
                                  >
                                    <Text style={styles.badgeText}>{badge.label}</Text>
                                  </View>
                                </View>
                              ))()}
                          </View>

                          {playdate.imageUrl && (
                            <Image
                              source={{ uri: playdate.imageUrl }}
                              style={styles.postImage}
                            />
                          )}

                          <View style={styles.postFooter}>
                            <Text style={styles.postStats}>{playdate.likes} likes</Text>
                            <Text style={styles.postStats}>{playdate.comments} comments</Text>
                            <Text style={styles.postDate}>
                              {playdate.createdAt.toLocaleDateString()}
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {activeJoinedPlaydates.length === 0 && (
                <Text style={{ color: "#666", marginTop: 8 }}>Go join the fun!</Text>
              )}
            </>
          );
        })()}
      </View>

      {/* User's Posts Section */}
      <View style={styles.postsSection}>
        <Text style={styles.sectionTitle}>My Posts</Text>
        
        {loadingPosts ? (
          <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 20 }} />
        ) : (
          <>
            {userPosts.length === 0 && userPlaydates.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No posts yet</Text>
                <Text style={styles.emptyStateSubtext}>Start sharing with the community!</Text>
              </View>
            ) : (
              <>
                {userPosts.length > 0 && (
                  <View style={styles.postTypeSection}>
                    <Text style={styles.postTypeTitle}>
                      Community Posts ({userPosts.length})
                    </Text>
                    {userPosts.map((post) => (
                      <TouchableOpacity
                        key={post.id}
                        activeOpacity={0.8}
                        onPress={() => {
                          router.push({pathname: '../communityPost', params: {id: post.id}});
                        }}
                      >
                        <View style={styles.postCard}>
                          {/* Top-right menu */}
                          <TouchableOpacity
                            style={styles.postMenuButton}
                            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                            onPress={(e) => {
                              e.stopPropagation();
                              setMenuVisible(true);
                              setSelectedPost({postId: post.id, type:'community'});
                            }}
                          >
                            <Text style={styles.postMenuText}>⋮</Text>
                          </TouchableOpacity>

                          <View style={styles.postHeader}>
                            <View style={styles.postBadge}>
                              <Text style={styles.postBadgeText}>{post.category}</Text>
                            </View>
                            <View style={styles.postBadge}>
                              <Text style={styles.postBadgeText}>{post.petType}</Text>
                            </View>
                          </View>

                          {/* Editing view for description */}
                          {isEditingPost &&
                          selectedPost?.type === 'community' &&
                          selectedPost.postId === post.id ? (
                            <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center' }}>
                              <TextInput
                                value={editedPostDescription ?? post.description}
                                onChangeText={setEditedPostDescription}
                                style={{
                                  flex: 1,
                                  borderWidth: 1,
                                  borderColor: '#ccc',
                                  borderRadius: 6,
                                  padding: 8,
                                }}
                                multiline
                              />
                              <TouchableOpacity
                                style={{ marginLeft: 8 }}
                                onPress={() => {
                                  handleEditPostDescription();
                                  setIsEditingPost(false);
                                  setSelectedPost(null);
                                  setEditedPostDescription(null);
                                }}
                              >
                                <Text style={{ color: '#007aff', fontWeight: '700' }}>Save</Text>
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <Text style={styles.postDescription}>{post.description}</Text>
                          )}

                          {post.imageUrl && (
                            <Image source={{ uri: post.imageUrl }} style={styles.postImage} />
                          )}

                          <View style={styles.postFooter}>
                            <Text style={styles.postStats}>{post.likes} likes</Text>
                            <Text style={styles.postStats}>{post.comments} comments</Text>
                            <Text style={styles.postDate}>
                              {post.createdAt.toLocaleDateString()}
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))}

                    {/* Modal for menu options */}
                    <Modal
                      visible={menuVisible}
                      transparent
                      onRequestClose={() => setMenuVisible(false)}
                    >
                      <TouchableOpacity style={styles.modalOverlay} onPress={() => setMenuVisible(false)}>
                        <View style={styles.modalContent}>
                          {["Edit", "Delete"].map((option) => (
                            <TouchableOpacity
                              key={option}
                              onPress={() => handleMenuOption(option as "Edit" | "Delete")}
                              style={styles.modalOption}
                            >
                              <Text style={styles.modalOptionText}>{option}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </TouchableOpacity>
                    </Modal>
                  </View>
                )}

                {/* Playdates */}
                {userPlaydates.length > 0 && (
                  <View style={styles.postTypeSection}>
                    <Text style={styles.postTypeTitle}>Playdates ({userPlaydates.length})</Text>
                    {userPlaydates.map((playdate) => (
                      <TouchableOpacity
                        key={playdate.id}
                        activeOpacity={0.8}
                        onPress={() =>
                          router.push({pathname: "/playdatePost", params: {id: playdate.id}})
                        }
                      >
                        <View style={styles.postCard}>
                          <TouchableOpacity
                            style={styles.postMenuButton}
                            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                            onPress={(e) => {
                              e.stopPropagation();
                              setMenuVisible(true);
                              setSelectedPost({postId: playdate.id, type:'playdate'});
                            }}
                          >
                            <Text style={styles.postMenuText}>⋮</Text>
                          </TouchableOpacity>
                          <Text style={styles.playdateTitle}>{playdate.title}</Text>
                          <View style={styles.playdateInfo}>
                            <Text style={styles.playdateLabel}>{playdate.dogBreed}</Text>
                            <Text style={styles.playdateLabel}>{playdate.city}, {playdate.state}</Text>
                          </View>
                          {/* Editing view for description */}
                          {isEditingPost &&
                          selectedPost?.type === 'playdate' &&
                          selectedPost.postId === playdate.id ? (
                            <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center' }}>
                              <TextInput
                                value={editedPostDescription ?? playdate.description}
                                onChangeText={setEditedPostDescription}
                                style={{
                                  flex: 1,
                                  borderWidth: 1,
                                  borderColor: '#ccc',
                                  borderRadius: 6,
                                  padding: 8,
                                }}
                                multiline
                              />
                              <TouchableOpacity
                                style={{ marginLeft: 8 }}
                                onPress={() => {
                                  handleEditPostDescription();
                                  setIsEditingPost(false);
                                  setSelectedPost(null);
                                  setEditedPostDescription(null);
                                }}
                              >
                                <Text style={{ color: '#007aff', fontWeight: '700' }}>Save</Text>
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <Text style={styles.postDescription}>{playdate.description}</Text>
                          )}
                          <View style={styles.playdateDetails}>
                            <Text style={styles.playdateDetailText}>{playdate.whenAt}</Text>
                            <Text style={styles.playdateDetailText}>{playdate.city}</Text>
                          </View>
                          {playdate.imageUrl && (
                            <Image source={{ uri: playdate.imageUrl }} style={styles.postImage} />
                          )}
                          <View style={styles.postFooter}>
                            <Text style={styles.postStats}>{playdate.likes} likes</Text>
                            <Text style={styles.postStats}>{playdate.comments} comments</Text>
                            <Text style={styles.postDate}>
                              {playdate.createdAt.toLocaleDateString()}
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))}
                    {/* Modal for menu options */}
                    <Modal
                      visible={menuVisible}
                      transparent
                      onRequestClose={() => setMenuVisible(false)}
                    >
                      <TouchableOpacity style={styles.modalOverlay} onPress={() => setMenuVisible(false)}>
                        <View style={styles.modalContent}>
                          {["Edit", "Delete"].map((option) => (
                            <TouchableOpacity
                              key={option}
                              onPress={() => handleMenuOption(option as "Edit" | "Delete")}
                              style={styles.modalOption}
                            >
                              <Text style={styles.modalOptionText}>{option}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </TouchableOpacity>
                    </Modal>
                  </View>
                )}

              </>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f2e9',
  },
  login: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    padding: 22,
    shadowColor: "#4b2e83",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    margin: 18,
    marginTop: 80,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(75,46,131,0.2)',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
    color: '#4b2e83',
  },
  errorContainer: {
    backgroundColor: '#fee',
    borderLeftWidth: 4,
    borderLeftColor: '#f00',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: '#c00',
    fontSize: 14,
    textAlign: 'center',
  },
  account_create: {
    fontSize: 14,
    color: '#444',
    marginBottom: 8
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: '#cbb89f',
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f9f6ee',
    marginBottom: 10,
    color: '#1f1533',
  },
  login_button: {
    backgroundColor: '#4b2e83',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 30
  },
  forgot_password: {
    color: '#7b7b7bff', 
    textDecorationLine: 'underline'
  },
  create_an_account: {
    fontSize: 14, 
    color: '#747373ff', 
    textAlign: 'center', 
    marginBottom: 10
  },
  signup_text: {
    color: '#6d6d6dff', 
    textDecorationLine: 'underline'
  },
  // Profile page styles
  profileHeader: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    padding: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e7ddc9',
  },
  avatarContainer: {
    marginBottom: 16,
  },
  profilePic: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: '#4b2e83',
  },
  username: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '700',
    color: '#4b2e83',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#ddd',
  },
  logoutButton: {
    backgroundColor: '#b7a57a',
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 10,
    marginTop: 8,
  },
  logoutButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  postsSection: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4b2e83',
    marginBottom: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
  },
  postTypeSection: {
    marginBottom: 24,
  },
  postTypeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#555',
    marginBottom: 12,
  },
  postCard: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#4b2e83',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(75,46,131,0.2)',
  },
  postHeader: {
    flexDirection: 'row',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 8,
  },
  postBadge: {
    backgroundColor: '#ebe3d0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  postBadgeText: {
    fontSize: 12,
    color: '#4b2e83',
    fontWeight: '600',
  },
  postDescription: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    marginBottom: 12,
  },
  postImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 12,
  },
  postFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e7ddc9',
  },
  postStats: {
    fontSize: 12,
    color: '#666',
  },
  postDate: {
    fontSize: 11,
    color: '#999',
  },
  playdateTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  playdateInfo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  playdateLabel: {
    fontSize: 13,
    color: '#4b2e83',
    fontWeight: '500',
  },
  playdateDetails: {
    backgroundColor: '#f9f6ee',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  playdateDetailText: {
    fontSize: 13,
    color: '#555',
    marginBottom: 4,
  },
  name: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    textAlign: 'center',
    marginTop: 4,
  },
  bio: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 6,
    marginHorizontal: 20,
  },
  emailPrivate: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 2,
    fontStyle: 'italic',
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#4b2e83',
    padding: 6,
    borderRadius: 20,
  },
  profileInfoBox: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    padding: 20,
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 14,
    shadowColor: '#4b2e83',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(75,46,131,0.2)',
  },

  infoRow: {
    marginBottom: 16,
  },

  infoLabel: {
    fontSize: 16,
    color: '#777',
    marginBottom: 4,
    fontWeight: '500',
  },

  infoValue: {
    fontSize: 15,
    color: '#555',
    lineHeight: 20,
  },

  infoDivider: {
    height: 1,
    backgroundColor: '#eee',
    marginTop: 12,
  },

  editButton: {
    alignSelf: "flex-end",
    backgroundColor: "#4b2e83",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 12,
  },
  editButtonText: {
    color: "#f6f2e9",
    fontWeight: "700",
  },

  inputField: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
    backgroundColor: "#fafafa",
    color: "#333",
    marginTop: 4,
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
  
  whenAt: {
  fontSize: 13,
  color: '#555',
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
