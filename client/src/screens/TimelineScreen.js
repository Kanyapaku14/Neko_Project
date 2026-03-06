import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import supabase from './config/supabaseClient';
import { analyzeHealthLog } from '../utils/healthLogic';

const FILTERS = [
  { key: 'all', label: 'ALL' },
  { key: 'log', label: 'log' },
  { key: 'community', label: 'community' },
  { key: 'camera', label: 'camera' },
];

const formatTime = (value) => {
  if (!value) return 'All Day';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'All Day';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const getGroupLabel = (dateString) => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const summarizeLog = (log, analysis) => {
  const food = log.total_food_grams ?? 0;
  const water = log.water_ml_per_day ?? 0;
  const alerts = analysis?.alerts?.length ? `Issues: ${analysis.alerts.join(', ')}` : 'No issues reported.';
  return `Food ${food} g, Water ${water} ml. ${alerts}`;
};

const safeSelectByUser = async (table, select, userId) => {
  const { data, error } = await supabase
    .from(table)
    .select(select)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return [];
  return data || [];
};

const safeSelectPostsByIds = async (table, postIds) => {
  if (!postIds.length) return [];
  const { data, error } = await supabase
    .from(table)
    .select('id, content')
    .in('id', postIds);

  if (error) return [];
  return data || [];
};

export default function TimelineScreen({ session, onBack }) {
  const [logs, setLogs] = useState([]);
  const [communityEvents, setCommunityEvents] = useState([]);
  const [cameraEvents, setCameraEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');

  useEffect(() => {
    if (session?.user?.id) {
      fetchTimelineData();
    }
  }, [session]);

  const fetchCommunityEvents = async (userId) => {
    const [
      sharedNew,
      sharedOld,
      likesNew,
      likesOld,
      commentsNew,
      commentsOld,
    ] = await Promise.all([
      safeSelectByUser('community_posts', 'id, content, created_at', userId),
      safeSelectByUser('posts', 'id, content, created_at', userId),
      safeSelectByUser('community_likes', 'id, post_id, created_at', userId),
      safeSelectByUser('post_likes', 'id, post_id, created_at', userId),
      safeSelectByUser('community_comments', 'id, post_id, content, created_at', userId),
      safeSelectByUser('comments', 'id, post_id, content, created_at', userId),
    ]);
    const likes = [...likesNew, ...likesOld];
    const comments = [...commentsNew, ...commentsOld];
    const shares = [...sharedNew, ...sharedOld];

    const postIds = [...new Set([
      ...likes.map((item) => item.post_id),
      ...comments.map((item) => item.post_id),
    ].filter(Boolean))];

    let postMap = {};
    if (postIds.length > 0) {
      const [postsNew, postsOld] = await Promise.all([
        safeSelectPostsByIds('community_posts', postIds),
        safeSelectPostsByIds('posts', postIds),
      ]);
      postMap = [...postsNew, ...postsOld].reduce((acc, row) => {
        acc[row.id] = row;
        return acc;
      }, {});
    }

    const shareEvents = shares.map((row) => ({
      id: `share-${row.id}-${row.created_at || ''}`,
      source: 'community',
      action: 'share',
      eventAt: row.created_at,
      title: 'You shared a post',
      detail: row.content || 'Shared a new update in community.',
    }));

    const likeEvents = likes.map((row) => {
      const post = postMap[row.post_id];
      return {
        id: `like-${row.id}-${row.created_at || ''}`,
        source: 'community',
        action: 'like',
        eventAt: row.created_at,
        title: 'You liked a post',
        detail: post?.content || 'Liked a community post.',
      };
    });

    const commentEvents = comments.map((row) => {
      const post = postMap[row.post_id];
      return {
        id: `comment-${row.id}-${row.created_at || ''}`,
        source: 'community',
        action: 'comment',
        eventAt: row.created_at,
        title: 'You commented on a post',
        detail: row.content || post?.content || 'Commented in community.',
      };
    });

    return [...shareEvents, ...likeEvents, ...commentEvents];
  };

  const fetchCameraEvents = async (userId) => {
    const { data, error } = await supabase
      .from('alerts')
      .select('id, type, title, description, timestamp, created_at, camera_id, source')
      .eq('owner_id', userId)
      .order('timestamp', { ascending: false })
      .limit(100);

    if (error) throw error;

    const rows = data || [];
    const cameraRows = rows.filter((item) => {
      const typeText = String(item.type || '').toLowerCase();
      const sourceText = String(item.source || '').toLowerCase();
      return !!item.camera_id || typeText.includes('camera') || sourceText.includes('camera');
    });

    return cameraRows.map((row) => ({
      id: `camera-${row.id}`,
      source: 'camera',
      action: 'camera',
      eventAt: row.timestamp || row.created_at,
      title: row.title || 'Camera event',
      detail: row.description || 'Camera activity detected.',
    }));
  };

  const fetchTimelineData = async () => {
    try {
      setLoading(true);
      const userId = session?.user?.id;
      if (!userId) {
        setLoading(false);
        return;
      }

      const { data: catData, error: catError } = await supabase
        .from('cats')
        .select('id, name, breed, gender')
        .eq('owner_id', userId)
        .limit(1)
        .maybeSingle();

      if (catError) throw catError;
      setCat(catData || null);

      const [communityResult, cameraResult] = await Promise.all([
        fetchCommunityEvents(userId).catch((e) => {
          console.log('Community events unavailable:', e?.message || e);
          return [];
        }),
        fetchCameraEvents(userId).catch((e) => {
          console.log('Camera events unavailable:', e?.message || e);
          return [];
        }),
      ]);

      setCommunityEvents(communityResult);
      setCameraEvents(cameraResult);

      if (!catData?.id) {
        setLogs([]);
        return;
      }

      const { data: logsData, error: logsError } = await supabase
        .from('daily_logs')
        .select('*, normal_logs(*), something_off_logs(*)')
        .eq('cat_id', catData.id)
        .order('log_date', { ascending: false });

      if (logsError) throw logsError;

      const unifiedLogs = (logsData || []).map((log) => {
        const details = log.log_type === 'something_off'
          ? (log.something_off_logs?.[0] || log.something_off_logs)
          : (log.normal_logs?.[0] || log.normal_logs);

        return {
          ...log,
          ...(details || {}),
        };
      });

      setLogs(unifiedLogs);
    } catch (error) {
      console.error('Error fetching timeline:', error);
    } finally {
      setLoading(false);
    }
  };

  const timelineItems = useMemo(() => {
    const logItems = logs.map((log, index) => {
      const analysis = analyzeHealthLog(log);
      return {
        id: `log-${log.id || index}`,
        source: 'log',
        action: 'log',
        eventAt: log.created_at || log.log_date,
        title: `Daily log: ${analysis.status.label.toLowerCase()}`,
        detail: summarizeLog(log, analysis),
      };
    });


    const allItems = [...logItems, ...communityEvents, ...cameraEvents];
    const filtered = allItems.filter((item) => activeFilter === 'all' || item.source === activeFilter);
    return filtered.sort((a, b) => new Date(b.eventAt) - new Date(a.eventAt));
  }, [logs, communityEvents, cameraEvents, activeFilter]);


  const groupedItems = useMemo(() => (
    timelineItems.reduce((groups, item) => {
      const label = getGroupLabel(item.eventAt);
      if (!groups[label]) groups[label] = [];
      groups[label].push(item);
      return groups;
    }, {})
  ), [timelineItems]);

  const getCardVisual = (item) => {
    if (item.source === 'community') {
      if (item.action === 'like') return { icon: 'heart', marker: '#E91E63', bg: '#FCE4EC' };
      if (item.action === 'comment') return { icon: 'chatbubble-ellipses', marker: '#039BE5', bg: '#E1F5FE' };
      return { icon: 'share-social', marker: '#7E57C2', bg: '#EDE7F6' };
    }
    if (item.source === 'camera') {
      return { icon: 'camera', marker: '#FB8C00', bg: '#FFF3E0' };
    }
    return { icon: 'calendar', marker: '#2D4A47', bg: '#E0F2F1' };
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#00695C" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Health Timeline</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.catInfo}>
        <View style={styles.avatarContainer}>
          <Image source={require('../../assets/cioncat.jpg')} style={styles.avatar} />
        </View>
        <Text style={styles.catName}>{cat?.name || 'MY CAT'}</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabScroll}
        contentContainerStyle={styles.tabContainer}
      >
        {FILTERS.map((filter) => {
          const isActive = activeFilter === filter.key;
          return (
            <TouchableOpacity
              key={filter.key}
              style={[styles.tab, isActive && styles.activeTab]}
              onPress={() => setActiveFilter(filter.key)}
            >
              <Text style={[styles.tabText, isActive ? styles.activeTabText : styles.inactiveTabText]}>
                {filter.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <ActivityIndicator size="large" color="#00695C" style={{ marginTop: 50 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {timelineItems.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No activities in this filter</Text>
              <Text style={styles.emptyDesc}>Try switching to ALL to view everything together.</Text>
            </View>
          ) : (
            <View style={styles.timelineContainer}>
              <View style={styles.verticalLine} />
              {Object.keys(groupedItems).map((groupLabel) => (
                <View key={groupLabel} style={styles.groupContainer}>
                  <Text style={styles.groupTitle}>{groupLabel}</Text>
                  {groupedItems[groupLabel].map((item) => {
                    const visual = getCardVisual(item);
                    return (
                      <View key={item.id} style={styles.timelineItem}>
                        <View style={styles.markerContainer}>
                          <View style={[styles.marker, { backgroundColor: visual.marker }]}>
                            <Ionicons name={visual.icon} size={16} color="#fff" />
                          </View>
                        </View>

                        <View style={[styles.card, { backgroundColor: visual.bg }]}>
                          <View style={styles.cardHeader}>
                            <Text style={styles.cardTitle}>{item.title}</Text>
                            <Text style={styles.cardTime}>{formatTime(item.eventAt)}</Text>
                          </View>
                          <Text style={styles.cardDetail}>{item.detail}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#00695C',
  },
  backButton: {
    width: 24,
  },
  catInfo: {
    alignItems: 'center',
    marginBottom: 14,
  },
  avatarContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: 'hidden',
    marginBottom: 5,
    borderWidth: 2,
    borderColor: '#eee',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  catName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#00695C',
    textTransform: 'uppercase',
  },
  tabContainer: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    paddingTop: 1,
    gap: 10,
    alignItems: 'center',
  },
  tabScroll: {
    maxHeight: 54,
    flexGrow: 0,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: '#D7E9E4',
    alignSelf: 'flex-start',
    minHeight: 38,
    justifyContent: 'center',
  },
  activeTab: {
    backgroundColor: '#2D4A47',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
  },
  activeTabText: {
    color: '#fff',
  },
  inactiveTabText: {
    color: '#00695C',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 40,
  },
  timelineContainer: {
    position: 'relative',
    paddingLeft: 20,
  },
  verticalLine: {
    position: 'absolute',
    left: 20,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#B2DFDB',
  },
  groupContainer: {
    marginBottom: 20,
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#263238',
    marginBottom: 15,
    marginLeft: 25,
  },
  timelineItem: {
    position: 'relative',
    marginBottom: 20,
    paddingLeft: 25,
  },
  markerContainer: {
    position: 'absolute',
    left: -33,
    top: 15,
    zIndex: 1,
  },
  marker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  card: {
    borderRadius: 12,
    padding: 15,
    minHeight: 80,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
    gap: 10,
  },
  cardTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#004D40',
  },
  cardTime: {
    fontSize: 12,
    color: '#004D40',
    opacity: 0.8,
  },
  cardDetail: {
    fontSize: 13,
    color: '#004D40',
    opacity: 0.9,
  },
  emptyWrap: {
    marginTop: 30,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#455A64',
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 13,
    color: '#78909C',
  },
});
