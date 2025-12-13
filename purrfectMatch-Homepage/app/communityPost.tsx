import React, { useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { View, Text, Image, ScrollView, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Modal, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { CommunityPostFirebase, getLikeStatusFirebase, toggleLikeFirebase, getCommentsFirebase, addCommentFirebase, CommentFirebase, deleteCommunityCommentFirebase, editCommunityCommentFirebase, getCommunityPostFirebase } from '../api/community';
import { getCurrentUser, getUserProfileFirebase } from '../api/firebaseAuth';

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

export type DisplayComment = CommentFirebase & {
  avatar: string, yours: boolean;
};



export default function PostDetail() {
  const params = useLocalSearchParams();
  const navigation = useNavigation();
  const [comment, setComment] = useState('');
  const [commentsList, setCommentsList] = useState<DisplayComment[]>([]);
  const [loadingPost, setLoadingPost] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [postAvatarUrl, setPostAvatarUrl] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState<boolean>(false);
  const [selectedComment, setSelectedComment] = useState<string | null>(null);
  const [editing, setEditing] = useState<boolean>(false);
  const [editedContent, setEditedContent] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [editHistoryModalVisible, setEditHistoryModalVisible] = useState<boolean>(false);
  const [selectedEdits, setSelectedEdits] = useState<string[] | null>(null);
  const [post, setPost] = useState<CommunityPostFirebase | null>(null);
  const [liked, setLiked] = useState<boolean>(false);
  const [liking, setLiking] = useState<boolean>(false);

  const router = useRouter();

  //const { id, user, authorId, time, petType, category, description, image } = params as Record<string, string | undefined>;
  const id = params.id as string | undefined;

  const loadPost = useCallback(async () => {
    if (!id) return;

    try {
      const data = await getCommunityPostFirebase(id);
      if (data) setPost(data);
    } catch (err) {
      console.error("Failed to load post:", err);
    }
  }, [id]);

  useEffect(() => {
    const fetchAvatarAndStatus = async () => {
      setLoadingPost(true);
      try {
        // Load the post
        await loadPost();

        if (!post?.authorId) {
          setLoadingPost(false);
          return;
        }

        const authorProfile = await getUserProfileFirebase(post.authorId);
        setPostAvatarUrl(authorProfile?.avatar || null);

        const currentUser = getCurrentUser();
        if (!currentUser || !id) return;

        const profile = await getUserProfileFirebase(currentUser.uid);
        setAvatarUrl(profile?.avatar || null);

        const liked = await getLikeStatusFirebase(id, currentUser.uid);
        setLiked(liked);

      } catch (err) {
        console.error("Failed to fetch avatar or status:", err);
        setPostAvatarUrl(null);
      } finally {
        setLoadingPost(false);
      }
    };

    fetchAvatarAndStatus();
  }, [loadPost, post?.authorId, id]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerStyle: { backgroundColor: '#4b2e83' },
      headerTintColor: '#f6f2e9',
      headerTitleStyle: { fontWeight: '800', color: '#f6f2e9' },
    });
  }, [navigation]);

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
      if (!id || !post) return;

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
      await toggleLikeFirebase(id, currentUser.uid);

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

  const [, setTick] = useState(0);
  useEffect(() => {
    const idt = setInterval(() => setTick(t => t + 1), 30 * 1000);
    return () => clearInterval(idt);
  }, []);

  const loadComments = useCallback(
    async () => {
      if (!id || !post?.authorId) return;

      setLoading(true);
      try {
        console.log("Loading comments from Firebase for post:", id);

        // Load comments
        const firebaseComments = await getCommentsFirebase(id);

        const currentUser = getCurrentUser();

        if (currentUser) {
          const userProfile = await getUserProfileFirebase(currentUser.uid);
          setAvatarUrl(userProfile?.avatar || null);
        }

        // Format each comment
        const formatted = await Promise.all(
          firebaseComments.map(async (c) => {
            const profile = await getUserProfileFirebase(c.authorId);
            console.log(c);
            return {
              ...c,
              avatar: profile?.avatar || null,
              yours: currentUser?.uid === c.authorId,
            };
          })
        );

        console.log(`Loaded ${formatted.length} comments from Firebase`);
        setCommentsList(formatted);
      } catch (err) {
        console.error("Error loading comments:", err);
      } finally {
        setLoading(false);
      }
    },
    [post?.authorId, id]
  );

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const displayedTime = formatTimeValue(post?.createdAt.toISOString());
  const commentCount = Math.max(commentsList.length, post?.comments ?? 0);

  const handlePostComment = async () => {
    const currentUser = getCurrentUser();
    if (!id || !comment.trim()) return;

    if (!currentUser) {
      Alert.alert('Not Logged In', 'Please log in to comment.');
      return;
    }

    try {
      setSubmitting(true);
      // --- Optimistic Update (increase local comment count immediately) ---
      // setPost(prev => {
      //   if (!prev) return prev;

      //   return {
      //     ...prev,
      //     comments: (prev.comments || 0) + 1,
      //   };
      // });

      // --- Send to Firebase ---
      await addCommentFirebase({
        postId: id,
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
      //await loadPost();
    } finally {
      setSubmitting(false);
    }
  };

 // const [isDeleting, setIsDeleting] = useState(false);

  const handleMenuOption = async (option: "Edit" | "Delete") => {
    if (!id) {
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

        setMenuVisible(false);

        // --- Optimistic Update (decrease comment count immediately) ---
        // setPost(prev => {
        //   if (!prev) return prev;

        //   return {
        //     ...prev,
        //     comments: Math.max(0, (prev.comments || 0) - 1),
        //   };
        // });

        // --- Firebase delete ---
        const response = await deleteCommunityCommentFirebase(selectedComment, id);

        if (response.success) {
          // Refresh the comments list from Firebase
          await loadComments();
          await loadPost(); // ensure accurate count sync

          Alert.alert("Success", "Comment deleted successfully.");
          setSelectedComment(null);
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

      const response = await editCommunityCommentFirebase(selectedComment, editedContent);

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
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0} // tweak if header height differs
    >
      <View style={styles.outer_container}>
        <ScrollView contentContainerStyle={[styles.container, { paddingBottom: 40 }]} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>

            <View style={styles.cardHeader}>
              {/* Avatar */}
              <TouchableOpacity onPress={() => router.push({ pathname: "/userProfile", params: { authorId: post?.authorId } })}>
                <Image
                  source={{
                    uri:
                      postAvatarUrl ||
                      'https://media.istockphoto.com/id/1444657782/vector/dog-and-cat-profile-logo-design.jpg?s=612x612&w=0&k=20&c=86ln0k0egBt3EIaf2jnubn96BtMu6sXJEp4AvaP0FJ0=',
                  }}
                  style={styles.profilePic}
                />
              </TouchableOpacity>
              {/* User info */}
              <View style={{ marginLeft: 12 }}>
                <TouchableOpacity onPress={() => router.push({ pathname: "/userProfile", params: { authorId: post?.authorId } })}>
                  <Text style={styles.user}>{post?.username ?? 'Unknown'}</Text>
                </TouchableOpacity>
                <Text style={styles.time}>{displayedTime}</Text>
              </View>
            </View>

            {/* Meta info */}
            <Text style={styles.meta}>{post?.petType ?? ''} • {post?.category ?? ''}</Text>
            {/* Description */}
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
            {post?.imageUrl ? <Image source={{ uri: post.imageUrl }} style={styles.image} /> : null}

            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, gap: 14 }}>
              {/* Like */}
              <TouchableOpacity
                onPress={() => toggleLike()}
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <Ionicons name={liked ? "heart" : "heart-outline"} size={20} color={liked ? "red" : "#444"} />
                <Text>{Math.max(0, post?.likes ?? 0)}</Text>
              </TouchableOpacity>

              {/* Comment Count */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Ionicons name="chatbubble-outline" size={20} color="#444" />
                <Text>{commentCount}</Text>
              </View>
            </View>
          </View>

          <View style={{ marginTop: 30 }}>
            <View style={styles.commentInputRow}>
              <Image
                source={{ uri: avatarUrl || 'https://media.istockphoto.com/id/1444657782/vector/dog-and-cat-profile-logo-design.jpg?s=612x612&w=0&k=20&c=86ln0k0egBt3EIaf2jnubn96BtMu6sXJEp4AvaP0FJ0=' }}
                style={styles.avatar}
              />

              <TextInput
                style={styles.input}
                value={comment}
                onChangeText={setComment}
                placeholder="Write a comment..."
                placeholderTextColor="#888"
                multiline
                editable={!submitting}
              />

              <TouchableOpacity
                onPress={handlePostComment}
                style={[styles.postButton, (!comment.trim() || submitting) && { opacity: 0.45 }]}
                disabled={!comment.trim() || submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.postButtonText}>Post</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={{ marginTop: 12 }}>
              {loading ? (
                <Text style={{ color: '#888', textAlign: 'center' }}>Loading comments...</Text>
              ) : commentsList.length === 0 ? (
                <Text style={{ color: '#888' }}>No comments yet - be the first to comment.</Text>
              ) : (
                commentsList.map(c => (
                  <View key={c.id} style={styles.commentRow}>
                    <TouchableOpacity
                      onPress={() => router.push({ pathname: "/userProfile", params: { authorId: c.authorId } })}
                    >
                      <Image source={{ uri: c.avatar || 'https://media.istockphoto.com/id/1444657782/vector/dog-and-cat-profile-logo-design.jpg?s=612x612&w=0&k=20&c=86ln0k0egBt3EIaf2jnubn96BtMu6sXJEp4AvaP0FJ0=' }} style={styles.commentAvatar} />
                    </TouchableOpacity>

                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TouchableOpacity
                          onPress={() => router.push({ pathname: "/userProfile", params: { authorId: c.authorId } })}
                        >
                          <Text style={{ fontWeight: '700', marginRight: 8 }}>{c.username}</Text>
                        </TouchableOpacity>
                        <Text style={{ color: '#666', fontSize: 12 }}>
                          {formatTimeValue(c.createdAt.toISOString())}
                        </Text>

                      </View>
                      {/* Editing View */}
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
                              style={{ color: "#666", fontSize: 10, marginLeft: 4 }}
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
                onRequestClose={() => setMenuVisible(false)}
                animationType="slide"
              >
                <TouchableOpacity style={styles.modalOverlay} onPress={() => setMenuVisible(false)}>
                  <View style={styles.modalContent}>
                    {["Edit", "Delete"].map((option) => (
                      <TouchableOpacity
                        key={option}
                        onPress={() => handleMenuOption(option as "Edit" | "Delete",)}
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


            </View>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  outer_container: {
    flex: 1,
    alignContent: "center",
    backgroundColor: '#f6f2e9',
  },
  container: {
    padding: 16,
    backgroundColor: '#f6f2e9',
    minHeight: '100%'
  },
  user: {
    fontSize: 20,
    fontWeight: '700'
  },

  card: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    shadowColor: "#4b2e83",
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    borderWidth: 1,
    borderColor: "rgba(75,46,131,0.2)",
  },

  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  profilePic: { width: 50, height: 50, borderRadius: 25 },

  time: {
    color: '#5a4b6b',
    marginTop: 4
  },
  meta: {
    color: '#4b2e83',
    marginTop: 8
  },
  image: {
    width: '100%',
    height: 300,
    borderRadius: 8,
    marginTop: 12,
    resizeMode: 'contain',
    backgroundColor: '#f0f0f0',
  },
  description: {
    marginTop: 12,
    fontSize: 16,
    color: '#1f1533'
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbb89f',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f9f6ee',
    marginBottom: 0,
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 8,
  },
  postButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#4b2e83',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  postButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e7ddc9',
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 8,
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
  fullScreenLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.9)',
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
});
