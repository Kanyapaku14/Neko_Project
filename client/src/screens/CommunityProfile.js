import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    StyleSheet,
    SafeAreaView,
    TouchableOpacity,
    Image,
    Dimensions,
    FlatList,
    ActivityIndicator,
    StatusBar,
    Alert,
    Modal,
    TextInput,
    KeyboardAvoidingView,
    Platform,
} from "react-native";
import { decode } from 'base64-arraybuffer';
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from 'expo-image-picker';
import supabase from './config/supabaseClient';
import PostCard from "../components/PostCard";
import PostDetailScreen from "./PostDetail.Screen";
import AddPostScreen from "./AddPostScreen";

const { width } = Dimensions.get("window");

export default function CommunityProfile({ session, userId, onBack, onNavigate }) {
    const [loading, setLoading] = useState(true);
    const [userProfile, setUserProfile] = useState(null);
    const [userPosts, setUserPosts] = useState([]);
    const [friendsCount, setFriendsCount] = useState(0);
    const [userScore, setUserScore] = useState(0);

    // Bio & Cover Editing
    const [isEditingBio, setIsEditingBio] = useState(false);
    const [newBio, setNewBio] = useState("");
    const [savingBio, setSavingBio] = useState(false);
    const [uploadingCover, setUploadingCover] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Friends Modal
    const [showFriendsModal, setShowFriendsModal] = useState(false);
    const [friendsTab, setFriendsTab] = useState('accepted'); // 'accepted' or 'pending'
    const [friendsList, setFriendsList] = useState([]);
    const [pendingList, setPendingList] = useState([]);
    const [loadingFriendsList, setLoadingFriendsList] = useState(false);

    // Post Options & Editing
    const [optionPost, setOptionPost] = useState(null);
    const [editingPost, setEditingPost] = useState(null);
    const [showAddPost, setShowAddPost] = useState(false);
    const [selectedPost, setSelectedPost] = useState(null);

    useEffect(() => {
        if (session?.user?.id) {
            loadProfileData();
        }
    }, [session, userId]);

    // Determine whose profile we are viewing
    const profileId = userId || session?.user?.id;
    const isReadyOnly = userId && userId !== session?.user?.id;

    // Sync selectedPost when userPosts update (to show new comments immediately)
    useEffect(() => {
        if (selectedPost) {
            const updated = userPosts.find(p => p.id === selectedPost.id);
            if (updated) {
                setSelectedPost(updated);
            }
        }
    }, [userPosts]);

    const loadProfileData = async () => {
        setLoading(true);
        try {
            await Promise.all([
                fetchProfile(),
                fetchUserPosts(),
                fetchFriendsCount(),
                fetchUserScore()
            ]);
        } catch (e) {
            console.log("Error loading profile data:", e);
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        try {
            await Promise.all([
                fetchProfile(),
                fetchUserPosts(),
                fetchFriendsCount(),
                fetchUserScore()
            ]);
        } finally {
            setRefreshing(false);
        }
    };

    const fetchProfile = async () => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', profileId)
                .single();

            if (error) {
                console.log("Fetch Profile Error:", error);
                return;
            }

            console.log("Profile Data Fetched:", data); // Debug logging

            if (data) {
                setUserProfile(data);
                setNewBio(data.bio || "");

                // Diagnostics: Check if fields exist
                if (data.cover_url === undefined) {
                    console.log("Warning: 'cover_url' field is missing from profile data.");
                }
                if (data.avatar_url === undefined) {
                    console.log("Warning: 'avatar_url' field is missing from profile data.");
                }
            }
        } catch (e) {
            console.log("Profile Fetch Exception:", e);
        }
    };

    const fetchUserPosts = async () => {
        const { data, error } = await supabase
            .from('posts')
            .select(`
        *,
        user:profiles!user_id(id, name, avatar_url),
        likes:post_likes(user_id),
        comments:comments(
          *,
          user:profiles!user_id(name, avatar_url)
        )
      `)
            .eq('user_id', profileId)
            .order('created_at', { ascending: false });

        if (data) {
            console.log("Fetched User Posts:", data.length);
            if (data.length > 0) {
                console.log("Sample User Post Raw:", data[0]);
            }

            const formatted = data.map(post => {
                const map = {
                    ...post,
                    image: post.image_url,
                    createdAt: post.created_at,
                    user: {
                        id: post.user?.id || post.user_id,
                        name: post.user?.name || userProfile?.name || 'Neko Lover',
                        avatar: post.user?.avatar_url || userProfile?.avatar_url || "https://placekitten.com/100/100"
                    },
                    likes: Array.isArray(post.likes) ? post.likes.map(l => l.user_id) : [],
                    comments: (post.comments || []).map(comment => ({
                        ...comment,
                        text: comment.content, // Ensure text mapping here too
                        createdAt: comment.created_at,
                        user: comment.user?.name || 'User',
                        avatar: comment.user?.avatar_url || "https://placekitten.com/40/40"
                    })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                };

                // Debug image mapping
                // if (post.image_url) console.log("Mapped Image:", map.image);

                return map;
            });
            setUserPosts(formatted);
        }
    };

    const fetchFriendsCount = async () => {
        try {
            const { data: q1, error: e1 } = await supabase
                .from('friends')
                .select('friend_id')
                .eq('user_id', profileId)
                .eq('status', 'accepted');

            const { data: q2, error: e2 } = await supabase
                .from('friends')
                .select('user_id')
                .eq('friend_id', profileId)
                .eq('status', 'accepted');

            const ids = new Set();
            if (q1) q1.forEach(row => ids.add(row.friend_id));
            if (q2) q2.forEach(row => ids.add(row.user_id));

            setFriendsCount(ids.size);
        } catch (e) {
            console.log("Error counting accepted friends:", e);
        }
    };

    const fetchFriendsData = async () => {
        setLoadingFriendsList(true);
        try {
            // 1) Fetch Accepted Friends (Both Directions)
            const { data: q1 } = await supabase.from("friends").select("friend_id").eq("user_id", profileId).eq("status", "accepted");
            const { data: q2 } = await supabase.from("friends").select("user_id").eq("friend_id", profileId).eq("status", "accepted");

            const ids = new Set();
            if (q1) q1.forEach(row => ids.add(row.friend_id));
            if (q2) q2.forEach(row => ids.add(row.user_id));

            const friendIds = Array.from(ids);
            if (friendIds.length > 0) {
                const { data: profiles } = await supabase.from("profiles").select("id, name, avatar_url").in("id", friendIds);
                setFriendsList(profiles || []);
            } else {
                setFriendsList([]);
            }

            // 2) Fetch Pending Outgoing Requests (Only sensible if viewing our own profile, but we can show it generally)
            if (!isReadyOnly) {
                const { data: pendingRows } = await supabase.from("friends").select("friend_id").eq("user_id", profileId).eq("status", "pending");
                if (pendingRows && pendingRows.length > 0) {
                    const pendingIds = pendingRows.map(r => r.friend_id);
                    const { data: pendingProfiles } = await supabase.from("profiles").select("id, name, avatar_url").in("id", pendingIds);
                    setPendingList(pendingProfiles || []);
                } else {
                    setPendingList([]);
                }
            } else {
                setPendingList([]);
            }

        } catch (e) {
            console.log("Error fetching friends data:", e);
        } finally {
            setLoadingFriendsList(false);
        }
    };

    const fetchUserScore = async () => {
        if (profileId === session?.user?.id) {
            const score = await calcScore(profileId);
            setUserScore(score);
            // Sync to database
            try {
                await supabase.from('profiles').update({ score }).eq('id', profileId);
            } catch (e) {
                console.log("Error syncing score:", e);
            }
        } else {
            try {
                const { data } = await supabase.from('profiles').select('score').eq('id', profileId).single();
                setUserScore(data?.score || 0);
            } catch (e) {
                console.log("Error fetching friend score:", e);
                setUserScore(0);
            }
        }
    };

    // ─── Score Calculation (matching RankingScreen) ───
    const getLocalDateString = (dateObj) => {
        const offset = dateObj.getTimezoneOffset();
        const localDate = new Date(dateObj.getTime() - (offset * 60 * 1000));
        return localDate.toISOString().split('T')[0];
    };

    const calcScore = async (targetUserId) => {
        let score = 0;
        let streakData = { streak: 0, isDouble: false };
        try {
            // 1) Get cats owned by this user
            let catIds = [];
            try {
                const { data: cats, error: catError } = await supabase
                    .from("cats")
                    .select("id")
                    .eq("owner_id", targetUserId);

                if (catError) throw catError;
                catIds = cats ? cats.map((c) => c.id) : [];

                // 2) Count daily_logs and compute streak
                if (catIds.length > 0) {
                    const { data: logs, error: logError } = await supabase
                        .from("daily_logs")
                        .select("log_date")
                        .in("cat_id", catIds);

                    if (logError) throw logError;

                    score += (logs ? logs.length : 0) * 1;

                    if (logs && logs.length > 0) {
                        const uniqueDates = [...new Set(logs.map(l => l.log_date))].sort((a, b) => new Date(b) - new Date(a));
                        const todayStr = getLocalDateString(new Date());
                        const yesterday = new Date();
                        yesterday.setDate(yesterday.getDate() - 1);
                        const yesterdayStr = getLocalDateString(yesterday);

                        let streak = 0;
                        if (uniqueDates[0] === todayStr || uniqueDates[0] === yesterdayStr) {
                            streak = 1;
                            const [y, m, d] = uniqueDates[0].split('-');
                            let checkDate = new Date(y, m - 1, d);
                            for (let i = 1; i < uniqueDates.length; i++) {
                                checkDate.setDate(checkDate.getDate() - 1);
                                if (uniqueDates[i] === getLocalDateString(checkDate)) {
                                    streak++;
                                } else {
                                    break;
                                }
                            }
                        }

                        let bonus = 0;
                        let fullCycles = Math.floor(streak / 7);
                        let remainderDays = streak % 7;

                        bonus += fullCycles * 28; // 1+2+3+4+5+6+7 = 28
                        for (let i = 1; i <= remainderDays; i++) {
                            bonus += i;
                        }
                        score += bonus;

                        streakData.streak = streak;
                        streakData.isDouble = streak >= 7;
                        streakData.cycleDays = remainderDays === 0 && streak > 0 ? 7 : remainderDays;
                    }
                }
            } catch (catLogEx) {
                console.log("CalcScore (Cats/Logs) Error:", catLogEx);
            }

            // 3) Count assessments (2pt each)
            try {
                const { count: assessCount } = await supabase
                    .from("assessments")
                    .select("id", { count: "exact", head: true })
                    .eq("user_id", targetUserId);
                score += (assessCount || 0) * 2;
            } catch { }

            // 4) Count assessments with image (1pt each)
            try {
                const { count: photoCount } = await supabase
                    .from("assessments")
                    .select("id", { count: "exact", head: true })
                    .eq("user_id", targetUserId)
                    .not("image_url", "is", null);
                score += (photoCount || 0) * 1;
            } catch { }
        } catch (e) {
            console.log("Score calc error:", e);
        }

        // 5) Count daily_checkins (Progressive Score: Day 1=1pt, Day 2=2pt, etc.)
        try {
            const { data: checkins, error: checkinError } = await supabase
                .from("daily_checkins")
                .select("checkin_date")
                .eq("user_id", targetUserId)
                .order("checkin_date", { ascending: false });

            if (!checkinError && checkins && checkins.length > 0) {
                const uniqueDates = [...new Set(checkins.map(c => c.checkin_date))];
                const todayStr = getLocalDateString(new Date());
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = getLocalDateString(yesterday);

                let streak = 0;
                let checkinScore = 0;

                // Check if streak is active (checked in today or yesterday)
                if (uniqueDates[0] === todayStr || uniqueDates[0] === yesterdayStr) {
                    streak = 1;
                    checkinScore += streak; // Day 1 = +1

                    const [y, m, d] = uniqueDates[0].split('-');
                    let checkDate = new Date(y, m - 1, d);
                    for (let i = 1; i < uniqueDates.length; i++) {
                        checkDate.setDate(checkDate.getDate() - 1);
                        if (uniqueDates[i] === getLocalDateString(checkDate)) {
                            streak++;
                            checkinScore += streak; // Day N = +N
                        } else {
                            break;
                        }
                    }
                }
                score += checkinScore;
            }
        } catch (e) {
            console.log("Checkin score error:", e);
        }

        if (streakData.isDouble) {
            score *= 2;
        }

        console.log(`FINAL Community calcScore for userId=${targetUserId}:`, score);

        return score;
    };

    const uploadImage = async (uri, bucket) => {
        if (!uri || uri.startsWith('http')) return uri;

        try {
            console.log("Preparing to upload:", uri);
            const fileName = `${session.user.id}_${Date.now()}.jpg`;

            // เพิ่มความชัวร์ในการดึงข้อมูลไฟล์
            const response = await fetch(uri);
            if (!response.ok) throw new Error("Could not fetch local image file");

            const arrayBuffer = await response.arrayBuffer();
            console.log("Actual file size to upload:", arrayBuffer.byteLength, "bytes");

            if (arrayBuffer.byteLength === 0) {
                throw new Error("File is empty (0 bytes). Please try a different photo.");
            }

            const { data, error: uploadError } = await supabase.storage
                .from(bucket)
                .upload(fileName, arrayBuffer, {
                    contentType: 'image/jpeg',
                    upsert: true
                });

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage
                .from(bucket)
                .getPublicUrl(fileName);

            console.log("Successfully uploaded. Public URL:", urlData.publicUrl);
            return urlData.publicUrl;
        } catch (e) {
            console.log("Detailed Upload Error:", e);
            throw e;
        }
    };

    const pickCoverImage = async () => {
        try {
            let result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [16, 9],
                quality: 0.8,
                base64: true, // เพิ่มตัวนี้!!
            });

            if (!result.canceled) {
                // ส่งทั้ง URI และ Base64 ไปประมวลผล
                handleSaveImage(result.assets[0].uri, 'cover_url', result.assets[0].base64);
            }
        } catch (e) {
            console.log("Error picking cover:", e);
            Alert.alert("Error", "Could not access image library.");
        }
    };

    const pickAvatarImage = async () => {
        try {
            let result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
                base64: true,
            });

            if (!result.canceled) {
                handleSaveImage(result.assets[0].uri, 'avatar_url', result.assets[0].base64);
            }
        } catch (e) {
            console.log("Error picking avatar:", e);
            Alert.alert("Error", "Could not access image library.");
        }
    };

    const handleSaveImage = async (uri, field, base64) => {
        if (!session?.user?.id) return;

        if (field === 'cover_url') setUploadingCover(true);
        else setUploadingAvatar(true);

        try {
            let uploadedUrl = "";
            const fileName = `${session.user.id}_${Date.now()}.jpg`;

            if (base64) {
                console.log(`Uploading ${field} via Base64...`);
                // แปลง Base64 เป็น ArrayBuffer โดยตรง (ชัวร์ที่สุดเพื่อเลี่ยง 0 bytes)
                const arrayBuffer = decode(base64);

                const { data, error: uploadError } = await supabase.storage
                    .from('posts')
                    .upload(fileName, arrayBuffer, {
                        contentType: 'image/jpeg',
                        upsert: true
                    });

                if (uploadError) throw uploadError;

                const { data: urlData } = supabase.storage
                    .from('posts')
                    .getPublicUrl(fileName);

                uploadedUrl = urlData.publicUrl;
            } else {
                console.log(`Uploading ${field} via URI fallback...`);
                uploadedUrl = await uploadImage(uri, 'posts');
            }

            const { error } = await supabase
                .from('profiles')
                .update({ [field]: uploadedUrl })
                .eq('id', session.user.id);

            if (error) {
                console.log(`Database update error for ${field}:`, error);
                throw error;
            } else {
                console.log(`DB Update Success! ${field} is now:`, uploadedUrl);
                const finalUrl = `${uploadedUrl}?t=${Date.now()}`;

                setUserProfile(prev => ({
                    ...(prev || {}),
                    [field]: finalUrl
                }));

                Alert.alert("Success", "Photo updated successfully! ✨");
            }
        } catch (e) {
            console.log(`Detailed Save Error for ${field}:`, e);
            Alert.alert("Error", `Failed to save image. ${e.message}`);
        } finally {
            setUploadingCover(false);
            setUploadingAvatar(false);
        }
    };

    const handleSaveBio = async () => {
        if (!session?.user?.id) return;
        setSavingBio(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ bio: newBio })
                .eq('id', session.user.id);

            if (error) {
                if (error.code === '42703') {
                    Alert.alert(
                        "Database Column Missing",
                        "The 'bio' column is missing in your profiles table. Please check database_setup.md and run the SQL under '1.3 เพิ่มคอลัมน์ Bio'"
                    );
                } else if (error.code === '42501') {
                    Alert.alert(
                        "Permission Denied (RLS)",
                        "You don't have permission to update your profile. Please check database_setup.md and run the SQL under '1.2 สิทธิ์การแก้ไข (UPDATE Policy)'"
                    );
                } else {
                    throw error;
                }
            } else {
                setUserProfile(prev => ({ ...prev, bio: newBio }));
                setIsEditingBio(false);
            }
        } catch (e) {
            console.log("Error saving bio:", e);
            Alert.alert("Error", "Failed to update bio. Please try again.");
        } finally {
            setSavingBio(false);
        }
    };

    // ➕ Save Post to Database
    const handleSavePost = async (postData) => {
        try {
            setLoading(true);

            // Re-using exiting uploadImage from CommunityProfile, but 'posts' bucket
            let uploadedImageUrl = null;
            if (postData.image) {
                const uris = postData.image.split(',').filter(Boolean);
                const newUrls = [];
                for (let uri of uris) {
                    if (!uri.startsWith('http')) {
                        const newUrl = await uploadImage(uri, 'posts');
                        if (newUrl) newUrls.push(newUrl);
                    } else {
                        newUrls.push(uri);
                    }
                }
                uploadedImageUrl = newUrls.length > 0 ? newUrls.join(',') : null;
            }

            const payload = {
                user_id: session.user.id,
                content: postData.content,
                image_url: uploadedImageUrl,
            };

            let result;
            if (editingPost) {
                result = await supabase
                    .from('posts')
                    .update(payload)
                    .eq('id', editingPost.id);
            } else {
                result = await supabase
                    .from('posts')
                    .insert(payload);
            }

            if (result.error) throw result.error;

            await fetchUserPosts(); // Refresh posts
            setEditingPost(null);
            setShowAddPost(false);
            Alert.alert("Success", "Post shared successfully! 🎉");
        } catch (e) {
            console.log("Save post error:", e);
            Alert.alert("Post Error", e.message || "Could not save post. Please check your data or permissions.");
        } finally {
            setLoading(false);
        }
    };

    // --- Actions ---
    // 🗑️ Delete Post Sync
    const handleDelete = (postId) => {
        Alert.alert("Delete Post", "Are you sure you want to delete this post?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                    try {
                        const { error } = await supabase
                            .from('posts')
                            .delete()
                            .eq('id', postId);

                        if (error) throw error;
                        setUserPosts(prev => prev.filter(p => p.id !== postId));
                        setOptionPost(null);
                    } catch (e) {
                        console.log("Delete error:", e);
                    }
                }
            }
        ]);
    };

    const handleEdit = (post) => {
        setEditingPost(post);
        setOptionPost(null);
        setShowAddPost(true);
    };

    // ❤️ Like / Unlike Sync
    const toggleLike = async (postId) => {
        const post = userPosts.find(p => p.id === postId);
        if (!post) return;

        const isLiked = post.likes.includes(session.user.id);

        try {
            if (isLiked) {
                await supabase
                    .from('post_likes')
                    .delete()
                    .match({ post_id: postId, user_id: session.user.id });
            } else {
                await supabase
                    .from('post_likes')
                    .insert({ post_id: postId, user_id: session.user.id });
            }

            // Optimistic Update or Refresh
            await fetchUserPosts();
        } catch (e) {
            console.log("Like error:", e);
        }
    };

    // 💬 Comment
    const addComment = async (postId, text) => {
        if (!text.trim()) return;
        try {
            const { error } = await supabase
                .from('comments')
                .insert({
                    post_id: postId,
                    user_id: session.user.id,
                    content: text
                });

            if (error) throw error;
            await fetchUserPosts();
        } catch (e) {
            console.log("Comment error:", e);
        }
    };

    // 🗑️ Delete Comment
    const deleteCommentFromPost = async (postId, commentId) => {
        try {
            const { error } = await supabase
                .from('comments')
                .delete()
                .match({ id: commentId, user_id: session.user.id });

            if (error) throw error;

            setUserPosts((prev) =>
                prev.map((post) =>
                    post.id === postId
                        ? {
                            ...post,
                            comments: post.comments.filter((c) => c.id !== commentId),
                        }
                        : post
                )
            );
        } catch (e) {
            console.log("Delete comment error:", e);
            Alert.alert("Error", "Failed to delete comment");
        }
    };

    const renderHeader = () => (
        <View style={styles.headerContent}>
            {/* Cover Image */}
            <TouchableOpacity
                style={styles.coverImageContainer}
                onPress={isReadyOnly ? null : pickCoverImage}
                disabled={uploadingCover || isReadyOnly}
                activeOpacity={isReadyOnly ? 1 : 0.9}
            >
                {userProfile?.cover_url && userProfile.cover_url.trim() !== "" ? (
                    <>
                        <Image
                            source={{ uri: userProfile.cover_url }}
                            style={styles.coverImage}
                            key={`img-${userProfile.cover_url}`}
                            resizeMode="cover"
                            onLoad={() => console.log("UI: Cover Image loaded successfully")}
                            onError={(e) => {
                                console.log("UI: Cover Load Error for URL:", userProfile.cover_url);
                                // Alert removed to prevent spamming
                            }}
                        />
                        {/* Debug Label Removed */}
                    </>
                ) : (
                    <LinearGradient
                        colors={["#B2DFDB", "#4DB6AC"]}
                        style={styles.coverImage}
                    />
                )}

                {!isReadyOnly && (
                    <View style={[styles.coverOverlay, { zIndex: 10 }]}>
                        {uploadingCover ? (
                            <ActivityIndicator color="#FFF" size="small" />
                        ) : (
                            <Ionicons name="camera-outline" size={20} color="#FFF" />
                        )}
                    </View>
                )}
            </TouchableOpacity>

            <View style={styles.profileInfoContainer}>
                {/* 1. Top Row: Avatar (Left) & Edit Button (Right) */}
                <View style={styles.topRow}>
                    <TouchableOpacity
                        style={[styles.avatarWrapper, { zIndex: 5 }]}
                        onPress={isReadyOnly ? null : pickAvatarImage}
                        disabled={uploadingAvatar || isReadyOnly}
                        activeOpacity={isReadyOnly ? 1 : 0.2}
                    >
                        <Image
                            source={{ uri: userProfile?.avatar_url || "https://placekitten.com/100/100" }}
                            style={styles.profileAvatar}
                            key={`avatar-${userProfile?.avatar_url}`}
                        />
                        {!isReadyOnly && (
                            <View style={styles.avatarEditOverlay}>
                                {uploadingAvatar ? (
                                    <ActivityIndicator color="#FFF" size="small" />
                                ) : (
                                    <Ionicons name="camera" size={16} color="#FFF" />
                                )}
                            </View>
                        )}
                    </TouchableOpacity>

                    {!isReadyOnly && (
                        <TouchableOpacity
                            style={styles.editBtnPill}
                            onPress={() => onNavigate && onNavigate("Profile")}
                        >
                            <Text style={styles.editBtnText}>Edit profile</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* 2. Name & Handle */}
                <View style={styles.nameContainer}>
                    <Text style={styles.profileName}>{userProfile?.name || "Neko User"}</Text>
                    <Text style={styles.profileHandle}>@{session?.user?.email?.split('@')[0] || "neko_lover"}</Text>
                </View>

                {/* 3. Bio */}
                <TouchableOpacity
                    style={styles.bioContainer}
                    onPress={isReadyOnly ? null : () => setIsEditingBio(true)}
                    activeOpacity={isReadyOnly ? 1 : 0.7}
                >
                    <Text style={styles.profileBio}>
                        {userProfile?.bio || (isReadyOnly ? "No bio yet 🐾" : "Tap to add a bio... 🐾")}
                    </Text>
                    {!isReadyOnly && (
                        <Ionicons name="pencil-outline" size={14} color="#CFD8DC" style={styles.bioIcon} />
                    )}
                </TouchableOpacity>

                {/* 4. Stats Row (X Style: Number + Label) */}
                <View style={styles.xStatsContainer}>
                    <View style={styles.xStatItem}>
                        <Text style={styles.xStatNumber}>{userPosts.length}</Text>
                        <Text style={styles.xStatLabel}>Posts</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.xStatItem}
                        onPress={() => {
                            setShowFriendsModal(true);
                            fetchFriendsData();
                        }}
                    >
                        <Text style={styles.xStatNumber}>{friendsCount}</Text>
                        <Text style={styles.xStatLabel}>Friends</Text>
                    </TouchableOpacity>
                    <View style={styles.xStatItem}>
                        <Text style={styles.xStatNumber}>{userScore}</Text>
                        <Text style={styles.xStatLabel}>Score</Text>
                    </View>
                </View>
            </View>

            <View style={styles.feedDivider}>
                <View style={styles.feedTitleRow}>
                    <Ionicons name="list-outline" size={20} color="#26A69A" />
                    <Text style={styles.feedTitle}>Posts</Text>
                </View>
            </View>
        </View>
    );

    // ➕ Add/Edit Post Screen Override
    if (showAddPost) {
        return (
            <AddPostScreen
                onClose={() => {
                    setShowAddPost(false);
                    setEditingPost(null); // Clear editing state on close
                }}
                onSubmit={handleSavePost}
                initialPost={editingPost}
                userProfile={userProfile}
                currentUserId={session?.user?.id}
            />
        );
    }

    // ─── Render Friends Modal ───
    const renderFriendsModal = () => {
        const displayedList = friendsTab === 'accepted' ? friendsList : pendingList;

        return (
            <Modal
                visible={showFriendsModal}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setShowFriendsModal(false)}
            >
                <SafeAreaView style={styles.modalContainer}>
                    {/* Header */}
                    <View style={styles.modalHeader}>
                        <TouchableOpacity
                            onPress={() => setShowFriendsModal(false)}
                            style={styles.modalCloseBtn}
                        >
                            <Ionicons name="close" size={24} color="#90A4AE" />
                        </TouchableOpacity>
                        <Text style={styles.modalTitle}>Friends</Text>
                        <View style={{ width: 40 }} />
                    </View>

                    {/* Tabs */}
                    <View style={styles.toggleContainer}>
                        <TouchableOpacity
                            style={[styles.toggleBtn, friendsTab === 'accepted' && styles.toggleBtnActive]}
                            onPress={() => setFriendsTab('accepted')}
                        >
                            <Text style={[styles.toggleText, friendsTab === 'accepted' && styles.toggleTextActive]}>Friends</Text>
                        </TouchableOpacity>
                        {!isReadyOnly && (
                            <TouchableOpacity
                                style={[styles.toggleBtn, friendsTab === 'pending' && styles.toggleBtnActive]}
                                onPress={() => setFriendsTab('pending')}
                            >
                                <Text style={[styles.toggleText, friendsTab === 'pending' && styles.toggleTextActive]}>Sent Requests</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* List */}
                    {loadingFriendsList ? (
                        <ActivityIndicator size="large" color="#4DB6AC" style={{ marginTop: 40 }} />
                    ) : (
                        <FlatList
                            data={displayedList}
                            keyExtractor={item => item.id}
                            contentContainerStyle={{ padding: 16 }}
                            ListEmptyComponent={
                                <View style={styles.noResult}>
                                    <Ionicons name="people-outline" size={48} color="#E0E0E0" />
                                    <Text style={styles.noResultText}>
                                        {friendsTab === 'accepted' ? 'No friends yet' : 'No pending requests'}
                                    </Text>
                                </View>
                            }
                            renderItem={({ item }) => (
                                <View style={styles.resultCard}>
                                    <Image
                                        source={{ uri: item.avatar_url || "https://placekitten.com/50/50" }}
                                        style={styles.resultAvatar}
                                    />
                                    <View style={styles.resultInfo}>
                                        <Text style={styles.resultName}>{item.name}</Text>
                                    </View>
                                    <View style={[styles.resultBadge, friendsTab === 'pending' && { backgroundColor: '#FFCC80' }]}>
                                        <Text style={[styles.resultBadgeText, friendsTab === 'pending' && { color: '#E65100' }]}>
                                            {friendsTab === 'accepted' ? 'Friend' : 'Pending'}
                                        </Text>
                                    </View>
                                </View>
                            )}
                        />
                    )}
                </SafeAreaView>
            </Modal>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Top Nav */}
            <View style={styles.topNav}>
                <TouchableOpacity onPress={onBack} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color="#37474F" />
                </TouchableOpacity>
                <Text style={styles.topNavTitle}>{isReadyOnly ? `${userProfile?.name || 'User'}'s Profile` : 'My Profile'}</Text>
                {!isReadyOnly ? (
                    <TouchableOpacity
                        style={styles.settingsBtn}
                        onPress={() => onNavigate && onNavigate("UserInfo")}
                    >
                        <Ionicons name="settings-outline" size={24} color="#37474F" />
                    </TouchableOpacity>
                ) : (
                    <View style={styles.settingsBtn} />
                )}
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#26A69A" />
                </View>
            ) : (
                <FlatList
                    data={userPosts}
                    keyExtractor={(item) => item.id}
                    ListHeaderComponent={renderHeader}
                    extraData={userProfile}
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    renderItem={({ item }) => (
                        <PostCard
                            post={item}
                            currentUserId={session?.user?.id}
                            onLike={toggleLike}
                            onOpen={() => setSelectedPost(item)}
                            onMore={(post) => setOptionPost(post)}
                        />
                    )}
                    contentContainerStyle={{ paddingBottom: 40 }}
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <Ionicons name="images-outline" size={48} color="#CFD8DC" />
                            <Text style={styles.emptyText}>No posts yet. Start sharing!</Text>
                        </View>
                    }
                />
            )}

            {/* 📝 Edit Bio Modal */}
            <Modal
                visible={isEditingBio}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setIsEditingBio(false)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    style={styles.modalOverlay}
                >
                    <View style={styles.bioModal}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Update Bio</Text>
                            <TouchableOpacity onPress={() => setIsEditingBio(false)}>
                                <Ionicons name="close" size={24} color="#546E7A" />
                            </TouchableOpacity>
                        </View>

                        <TextInput
                            style={styles.bioInput}
                            placeholder="Tell the world about you and your cats..."
                            multiline
                            maxLength={150}
                            value={newBio}
                            onChangeText={setNewBio}
                            autoFocus
                        />

                        <Text style={styles.charCount}>{newBio?.length || 0}/150</Text>

                        <TouchableOpacity
                            style={[styles.saveBioBtn, savingBio && { opacity: 0.7 }]}
                            onPress={handleSaveBio}
                            disabled={savingBio}
                        >
                            {savingBio ? (
                                <ActivityIndicator size="small" color="#FFF" />
                            ) : (
                                <Text style={styles.saveBioText}>Save Bio 🐾</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* 🔍 Post Detail Modal */}
            {selectedPost && selectedPost.id && (
                <Modal
                    visible={!!selectedPost}
                    animationType="slide"
                    presentationStyle="pageSheet"
                    onRequestClose={() => setSelectedPost(null)}
                >
                    <PostDetailScreen
                        post={selectedPost}
                        onClose={() => setSelectedPost(null)}
                        onAddComment={addComment}
                        onDeleteComment={deleteCommentFromPost}
                        userProfile={userProfile}
                        currentUserId={session?.user?.id}
                        onBack={() => setSelectedPost(null)}
                        session={session}
                        onNavigate={onNavigate}
                    />
                </Modal>
            )}

            {/* ⚙️ Options Modal (Bottom Sheet Style) */}
            <Modal
                visible={!!optionPost}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setOptionPost(null)}
            >
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setOptionPost(null)}
                >
                    <View style={styles.bottomSheet}>
                        <View style={styles.dragHandle} />

                        {optionPost && optionPost.user.id === session?.user?.id ? (
                            <>
                                <TouchableOpacity style={styles.optionItem} onPress={() => handleEdit(optionPost)}>
                                    <Ionicons name="pencil-outline" size={24} color="#37474F" />
                                    <Text style={styles.optionText}>Edit Post</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.optionItem} onPress={() => handleDelete(optionPost.id)}>
                                    <Ionicons name="trash-outline" size={24} color="#E57373" />
                                    <Text style={[styles.optionText, { color: "#E57373" }]}>Delete Post</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <TouchableOpacity style={styles.optionItem} onPress={() => setOptionPost(null)}>
                                    <Ionicons name="close-circle-outline" size={24} color="#37474F" />
                                    <Text style={styles.optionText}>Close Options</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* Friends Modal */}
            {renderFriendsModal()}

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#F4FAF9", // Soft Mint Background
    },
    topNav: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingVertical: 14,
        backgroundColor: "#FFF",
        borderBottomWidth: 1,
        borderBottomColor: "#E0F2F1",
    },
    topNavTitle: {
        fontSize: 18,
        fontFamily: "Inter-Bold",
        color: "#26A69A",
    },
    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#F4FAF9",
    },
    headerContent: {
        backgroundColor: "#FFF",
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
        overflow: "hidden",
        elevation: 4,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
    },
    coverImageContainer: {
        width: "100%",
        height: 140,
        backgroundColor: "#B2DFDB",
        position: 'relative',
    },
    coverImage: {
        width: width,
        height: 140,
    },
    coverOverlay: {
        position: 'absolute',
        top: 12,
        right: 12,
        backgroundColor: 'rgba(0,0,0,0.3)',
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.4)',
    },
    profileInfoContainer: {
        paddingHorizontal: 20,
        paddingBottom: 24,
    },
    avatarStatsRow: {
        flexDirection: "row",
        alignItems: "flex-end",
        marginTop: -45,
        paddingBottom: 10, // Add padding
    },
    avatarWrapper: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 4,
        borderColor: "#FFF",
        backgroundColor: "#FFF",
        marginTop: -40, // Pull up to overlap cover
    },
    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginBottom: 10,
    },
    editBtnPill: {
        marginTop: 10,
        borderWidth: 1,
        borderColor: '#CFD8DC',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 6,
        backgroundColor: '#FFF',
    },
    editBtnText: {
        fontSize: 14,
        fontFamily: "Inter-SemiBold",
        color: "#263238",
    },
    nameContainer: {
        marginTop: 0,
    },
    profileName: {
        fontSize: 19, // Reduced from 22
        fontFamily: "Inter-Bold",
        color: "#263238",
        lineHeight: 26,
    },
    profileHandle: {
        fontSize: 15,
        fontFamily: "Inter-Regular",
        color: "#546E7A",
        marginTop: 0,
    },
    bioContainer: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: 12,
        paddingRight: 10,
        marginBottom: 16,
    },
    xStatsContainer: {
        flexDirection: 'row',
        gap: 20,
    },
    xStatItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    xStatNumber: {
        fontSize: 15,
        fontFamily: "Inter-Bold",
        color: "#263238",
    },
    xStatLabel: {
        fontSize: 15,
        fontFamily: "Inter-Regular",
        color: "#546E7A",
    },
    profileAvatar: {
        width: "100%",
        height: "100%",
        borderRadius: 40,
    },
    avatarEditOverlay: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: '#26A69A',
        width: 26,
        height: 26,
        borderRadius: 13,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
        borderColor: '#FFF',
    },
    profileBio: {
        fontSize: 15,
        fontFamily: "Inter-Regular",
        color: "#263238",
        lineHeight: 20,
        flex: 1,
    },
    bioIcon: {
        marginLeft: 5,
        opacity: 0.5,
    },
    feedDivider: {
        paddingHorizontal: 20,
        paddingVertical: 20,
        backgroundColor: "#F4FAF9",
    },
    feedTitleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    feedTitle: {
        fontSize: 16,
        fontFamily: "Inter-Bold",
        color: "#263238",
    },
    emptyState: {
        alignItems: "center",
        paddingVertical: 80,
        opacity: 0.5,
    },
    emptyText: {
        marginTop: 12,
        fontSize: 15,
        fontFamily: "Inter-Medium",
        color: "#90A4AE",
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "flex-end",
    },
    bioModal: {
        backgroundColor: "#FFFFFF",
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: 40,
    },
    modalHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingTop: 16,
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 18,
        fontFamily: "Inter-Bold",
        color: "#263238",
    },
    bioInput: {
        backgroundColor: "#F5F7FA",
        borderRadius: 12,
        padding: 16,
        height: 120,
        textAlignVertical: "top",
        fontSize: 16,
        fontFamily: "Inter-Regular",
        color: "#37474F",
    },
    charCount: {
        alignSelf: "flex-end",
        marginTop: 8,
        fontSize: 12,
        fontFamily: "Inter-Medium",
        color: "#90A4AE",
    },
    saveBioBtn: {
        marginTop: 20,
        backgroundColor: "#26A69A",
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: "center",
    },
    saveBioText: {
        color: "#FFFFFF",
        fontSize: 16,
        fontFamily: "Inter-Bold",
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "flex-end",
    },
    bottomSheet: {
        backgroundColor: "#FFFFFF",
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: 40,
    },
    dragHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: "#E0E0E0",
        alignSelf: "center",
        marginBottom: 20,
    },
    optionItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#F5F5F5",
    },
    optionText: {
        fontSize: 16,
        fontFamily: "Inter-SemiBold",
        color: "#37474F",
        marginLeft: 16,
    },
    // New Modal / Toggle Styles
    modalContainer: {
        flex: 1,
        backgroundColor: "#F4FAF9",
    },
    modalCloseBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "#E0F2F1",
        justifyContent: "center",
        alignItems: "center",
    },
    toggleContainer: {
        flexDirection: 'row',
        backgroundColor: "#E0F2F1",
        borderRadius: 12,
        padding: 4,
        marginHorizontal: 16,
        marginVertical: 12,
    },
    toggleBtn: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 8,
    },
    toggleBtnActive: {
        backgroundColor: "#FFFFFF",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    toggleText: {
        fontSize: 14,
        fontFamily: "Inter-SemiBold",
        color: "#78909C",
    },
    toggleTextActive: {
        color: "#26A69A",
    },
    resultCard: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#FFFFFF",
        padding: 12,
        borderRadius: 16,
        marginBottom: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 1,
    },
    resultAvatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        marginRight: 12,
        backgroundColor: "#ECEFF1",
    },
    resultInfo: {
        flex: 1,
    },
    resultName: {
        fontSize: 16,
        fontFamily: "Inter-SemiBold",
        color: "#37474F",
        marginBottom: 2,
    },
    resultBadge: {
        backgroundColor: "#E0F2F1",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    resultBadgeText: {
        fontSize: 12,
        fontFamily: "Inter-Bold",
        color: "#00897B",
    },
    noResult: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 60,
    },
    noResultText: {
        fontSize: 16,
        fontFamily: "Inter-Medium",
        color: "#B0BEC5",
        marginTop: 12,
    },
});
