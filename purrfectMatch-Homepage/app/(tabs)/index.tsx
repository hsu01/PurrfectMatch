// CommunityScreen component for PurrfectMatch app

import { Ionicons } from '@expo/vector-icons';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Image as ExpoImage } from 'expo-image';
import { useRouter } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions, KeyboardAvoidingView, Platform, ActivityIndicator, RefreshControl, } from 'react-native';
import { createCommunityPostFirebase, listCommunityPostsFirebase, toggleLikeFirebase, getLikeStatusFirebase } from '../../api/community';
import CreateCommunityPost from '../CreateCommunityPost';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { app } from '../../config/firebase';
import { getCurrentUser, getUserProfileFirebase } from '../../api/firebaseAuth';

type Post = {
  id: number;
  firebaseId: string;
  authorId: string;
  user: string;
  avatar: string;
  created_at?: string;
  petType: string;
  category: string;
  description: string;
  image?: string;
  liked?: boolean;
  likes: number;
  comments: number;
};

async function uploadImageToStorage(uri: string, folder: string = 'community'): Promise<string> {
  const storage = getStorage(app); // or getStorage() if you initialize elsewhere

  const response = await fetch(uri);
  const blob = await response.blob();

  const filename = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const storageRef = ref(storage, filename);

  await uploadBytes(storageRef, blob);
  const downloadUrl = await getDownloadURL(storageRef);
  return downloadUrl;
}

export default function CommunityScreen() {
  const [showForm, setShowForm] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [filteredPosts, setFilteredPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchPetType, setSearchPetType] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [likingMap, setLikingMap] = useState<Record<string, boolean>>({});
  //const [currentUser, setCurrentUser] = useState<{ id: string; username: string } | null>(null);
  const { width } = useWindowDimensions();

  const formatRelativeTime = (iso: string) => {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return iso;
    const diff = Date.now() - t;
    const minute = 60_000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < minute) {
      return 'now';
    }
    if (diff < hour) {
      return `${Math.floor(diff / minute)}m`;
    }
    if (diff < day) {
      return `${Math.floor(diff / hour)}h`;
    }
    if (diff < 10 * day) {
      return `${Math.floor(diff / day)}d`;
    }
    const d = new Date(t);
    return `${d.getMonth() + 1}.${d.getDate()}.${d.getFullYear()}`;
  };

  const formatTimeValue = (v?: string | null) => {
    if (!v) return '';
    const parsed = Date.parse(v);
    if (Number.isNaN(parsed)) return v;
    return formatRelativeTime(v);
  };

  const [, setTick] = useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  /*
  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser({
          id: user.uid,
          username: user.displayName || 'User',
        });
        console.log('User logged in:', user.email);
      } else {
        setCurrentUser(null);
        console.log('No user logged in');
      }
    });

    return unsubscribe;
  }, []);
  */

  const loadPosts = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      console.log('Loading community posts from Firebase...');
      const firebasePosts = await listCommunityPostsFirebase();
      const currentUser = getCurrentUser();
      
      const formattedPosts = await Promise.all(firebasePosts.map(async (post, index) => {
        // Check if current user liked this post
        const liked = currentUser ? await getLikeStatusFirebase(post.id, currentUser.uid) : false;
        // Fetch author profile to get avatar
        const profile = await getUserProfileFirebase(post.authorId);
        
        return {
          id: index + 1,
          firebaseId: post.id,
          user: post.username,
          authorId: post.authorId,
          avatar: profile?.avatar,
          created_at: post.createdAt.toISOString(),
          petType: post.petType,
          category: post.category,
          description: post.description,
          image: post.imageUrl,
          likes: post.likes,
          comments: post.comments,
          liked,
        };
      }));
      
      console.log(`Loaded ${formattedPosts.length} community posts from Firebase`);
      setPosts(formattedPosts);
      setFilteredPosts(formattedPosts);
    } catch (err: any) {
      console.error('Failed to load community posts from Firebase', err);
      setLoadError(err?.message || 'Failed to load community posts');
    } finally {
      setLoading(false);
    }
  }, []);

  const hasLoaded = useRef(false);

  useEffect(() => {
    if (hasLoaded.current) return;
    hasLoaded.current = true;
    loadPosts();
  }, [loadPosts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPosts();
    setRefreshing(false);
  }, [loadPosts]);

  const showAlert = (title: string, message: string) => {
    if (typeof window !== 'undefined' && window.alert) {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message, [{ text: 'OK' }]);
    }
  };

  const handleCreateFromComponent = async (dto: {
    petType?: string | null;
    category?: string | null;
    description: string;
    image?: string | null;   // will be a local URI from device, or null/undefined
  }) => {
    if (isSubmitting) return;
    const trimmedDesc = dto.description.trim();
  
    if (!trimmedDesc) {
      showAlert('Missing Description', 'Please provide a description for your post.');
      return;
    }

    const currentUser = getCurrentUser();
  
    if (!currentUser) {
      showAlert('Not Logged In', 'Please log in to create a post.');
      return;
    }
  
    setIsSubmitting(true);
  
    const petType = dto.petType || 'All Pets';
    const category = dto.category || 'Other';
  
    let imageUrl: string | undefined = undefined;
  
    // If CreateCommunityPost passed up a local URI, upload it to Storage
    if (dto.image) {
      try {
        console.log('Uploading community image to Firebase Storage...');
        imageUrl = await uploadImageToStorage(dto.image, 'community');
      } catch (e) {
        console.error('Failed to upload community image', e);
        showAlert('Image upload failed', 'Your post will be created without a photo.');
        imageUrl = undefined;
      }
    }
  
    try {
      console.log('Creating community post in Firebase...');
      
      await createCommunityPostFirebase({
        authorId: currentUser.uid,
        username: currentUser.displayName || 'User',
        petType,
        category,
        description: trimmedDesc,
        imageUrl, // may be undefined if no image / upload failed
      });
  
      console.log('Community post created! Refreshing feed...');
      await loadPosts();
      setShowForm(false);
      showAlert('Success!', 'Your community post has been posted!');
    } catch (error) {
      console.error('Failed to create community post in Firebase:', error);
      showAlert('Submission failed', 'Could not send post. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };  

  const handleSearch = (petType: string) => {
    if (!petType.trim()) {
      setFilteredPosts(posts);
      return;
    }
    const results = posts.filter(
      post => post.petType.toLowerCase() === petType.toLowerCase()
    );
    setFilteredPosts(results);
  };

  const cardWidth = Math.max(300, Math.min(width - 32, 800));
  const router = useRouter();

  const toggleLike = async (postId: number, firebaseId: string) => {
    if (likingMap[firebaseId]) return;
    setLikingMap(prev => ({ ...prev, [firebaseId]: true }));

    const currentUser = getCurrentUser();
    if (!currentUser) {
      Alert.alert('Not Logged In', 'Please log in to like posts.');
      setLikingMap(prev => ({ ...prev, [firebaseId]: false }));
      return;
    }

    try {
      // Optimistic update
      const updatePosts = (prev: Post[]) =>
        prev.map(p =>
          p.id === postId
            ? { ...p, liked: !p.liked, likes: p.liked ? Math.max(0, p.likes - 1) : p.likes + 1 }
            : p
        );

      setPosts(updatePosts);
      setFilteredPosts(updatePosts);

      // Update Firebase
      await toggleLikeFirebase(firebaseId, currentUser.uid);
      
      // Reload to sync with Firebase
      //await loadPosts();
    } catch (error) {
      console.error('Error toggling like:', error);
      Alert.alert('Error', 'Failed to update like. Please try again.');
      // Revert optimistic update
      await loadPosts();
    } finally {
      setLikingMap(prev => ({ ...prev, [firebaseId]: false }));
    }
  };

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

  return (
    <KeyboardAvoidingView
    style={{ flex: 1 }}
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    // tweak this number depending on your header + tab bar height (80–140 is common)
    keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
    <View style={styles.container}>
      {!showForm && (
        <>
          <Text style={styles.header}>Paws, play, and share the love!</Text>
          {loadError && (
            <Text style={{ textAlign: 'center', marginTop: 8, color: 'red' }}>{loadError}</Text>
          )}

          <View style={styles.searchContainer}>
            <View style={styles.searchBox}>
              <TextInput
                placeholder="Search by pet type (e.g. Cat)"
                placeholderTextColor="#888"
                style={styles.searchInput}
                value={searchPetType}
                onChangeText={text => setSearchPetType(text)}
                returnKeyType="search"
                onSubmitEditing={({ nativeEvent }) => handleSearch(nativeEvent.text)}
              />
              <TouchableOpacity onPress={() => handleSearch(searchPetType)} style={styles.searchIcon}>
                <Ionicons name="search" size={20} color="#888" />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            style={styles.feed}
            contentContainerStyle={{ alignItems: 'center' }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4b2e83" />
            }
          >
            {filteredPosts.map(post => (
                <View key={post.id} style={[styles.card, { width: cardWidth }]}>
                {/* Tap ANYWHERE in this top area to open details */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    router.push({pathname: '../communityPost',params: {id: post.firebaseId}});
                  }}
                >
                  <View style={styles.cardHeader}>
                    <TouchableOpacity activeOpacity={0.8} onPress={goToProfile(post.authorId)}>
                      <ExpoImage
                        source={{ uri: post.avatar || 'https://media.istockphoto.com/id/1444657782/vector/dog-and-cat-profile-logo-design.jpg?s=612x612&w=0&k=20&c=86ln0k0egBt3EIaf2jnubn96BtMu6sXJEp4AvaP0FJ0=' }}
                        style={styles.profilePic}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                    </TouchableOpacity>

                    <View>
                      <TouchableOpacity activeOpacity={0.8} onPress={goToProfile(post.authorId)}>
                        <Text style={styles.username}>{post.user}</Text>
                      </TouchableOpacity>

                      <Text style={styles.time}>{formatTimeValue(post.created_at)}</Text>
                    </View>
                  </View>

                  <Text style={styles.description} numberOfLines={3}>
                    {post.description}
                  </Text>

                  {post.image ? (
                    <ExpoImage
                      source={{ uri: post.image }}
                      style={styles.cardImage}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  ) : null}
                </TouchableOpacity>

                {/* Bottom row: like + comment buttons (no navigation on like tap) */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
                  <TouchableOpacity
                    style={{ marginRight: 16, flexDirection: 'row', alignItems: 'center' }}
                    onPress={() => {
                      toggleLike(post.id, post.firebaseId);
                    }}
                  >
                    <Ionicons
                      name={post.liked ? 'heart' : 'heart-outline'}
                      size={20}
                      color={post.liked ? '#e0245e' : '#000'}
                    />
                    <Text style={{ marginLeft: 8 }}>{post.likes}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{ marginRight: 16, flexDirection: 'row', alignItems: 'center' }}
                    onPress={() => {
                      router.push({
                        pathname: '../communityPost',
                        params: {
                          id: post.firebaseId,
                          user: post.user,
                          authorId: post.authorId,
                          time: post.created_at ?? '',
                          petType: post.petType,
                          category: post.category,
                          description: post.description,
                          image: post.image ? encodeURIComponent(post.image) : '',
                        },
                      });
                    }}
                  >
                    <Ionicons name="chatbubble-outline" size={20} />
                    <Text style={{ marginLeft: 8 }}>{post.comments}</Text>
                  </TouchableOpacity>
                </View>
                </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.fab} onPress={handleFabPress}>
            <Ionicons name="add" size={32} color="white" />
          </TouchableOpacity>
        </>
      )}

      {showForm && (
        <CreateCommunityPost
          onSubmit={handleCreateFromComponent}
          onCancel={() => setShowForm(false)}
          isSubmitting={isSubmitting}
        />
      )}
    </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f2e9'
  },
  header: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 40,
    color: '#4b2e83',
    letterSpacing: 0.5,
    textTransform: 'none'
  },
  searchContainer: {
    flexDirection: 'row',
    margin: 16,
    alignItems: 'center'
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#f2f2f2',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderRadius: 8
  },
  searchInput: {
    flex: 1,
    paddingVertical: 6
  },
  searchIcon: {
    padding: 6
  },
  feed: {
    flex: 1,
    paddingHorizontal: 16
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    shadowColor: '#4b2e83',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
    borderWidth: 1,
    borderColor: 'rgba(75, 46, 131, 0.45)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  profilePic: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10
  },
  username: {
    fontWeight: '600',
    fontSize: 15
  },
  time: {
    color: '#666',
    fontSize: 12
  },
  cardImage: {
    width: '100%',
    height: 250,
    borderRadius: 8,
    resizeMode: 'contain',
    marginTop: 6,
    backgroundColor: '#f5f5f5',
  },
  description: {
    color: '#444',
    marginTop: 8
  },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    backgroundColor: '#b7a57a',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4
  },
});
