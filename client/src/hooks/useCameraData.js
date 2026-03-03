import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import supabase from '../screens/config/supabaseClient';
import { analyzeHealthLog } from '../utils/healthLogic';

export default function useCameraData(session, cameraStatus) {
  const [data, setData] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchData = useCallback(async () => {
    // Default structure (matches UI expectations) - Initializing with this ensures immediate render
    let newData = {
      connectedAt: Date.now() - 120000,
      cats: 0,
      food: 0,
      litter: 0,
      activity: [20, 45, 10, 80, 50], // Mock graph data (5 points for 6h intervals)
      posture: {
        abnormal: { percent: 0, name: 'None' },
        normal: { percent: 100, name: 'Normal' }
      },
      behaviorAnalytics: {
        energy: { active: 50, resting: 50 },
        routine: { score: 100, status: "Ideal" },
        wellness: { score: 85, status: "Healthy" }
      },
      settings: { monitoringMode: 'multi', selectedCats: [] }
    };

    // Set initial data immediately to avoid blocking UI with a long spinner
    if (!data) setData(newData);

    try {
      // 1. Load Local Settings
      const mode = await AsyncStorage.getItem('camera_monitoringMode');
      const savedCats = await AsyncStorage.getItem('camera_selectedCats');

      newData.settings = {
        monitoringMode: mode || 'multi',
        selectedCats: savedCats ? JSON.parse(savedCats) : []
      };

      // 2. Fetch Real Data if Session Exists
      if (session?.user) {
        // A. Get Cat Count
        const { data: catsData, error: catError } = await supabase
          .from('cats')
          .select('id')
          .eq('owner_id', session.user.id);

        if (!catError && catsData) {
          newData.cats = catsData.length;
          const catIdsList = catsData.map(c => c.id);
          const catIds = catIdsList;

          // Get today's logs (local date string YYYY-MM-DD)
          const now = new Date();
          const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

          const { data: logs, error: logsError } = await supabase
            .from('daily_logs')
            .select(`
              *,
              normal_logs(*),
              something_off_logs(*)
            `)
            .in('cat_id', catIds)
            .eq('log_date', today);

          if (!logsError && logs && logs.length > 0) {
            let totalFood = 0;
            let totalLitter = 0;
            let worstAnalysis = null;
            let latestLogForPosture = null;

            logs.forEach(log => {
              const details = log.log_type === 'something_off'
                ? (log.something_off_logs?.[0] || log.something_off_logs)
                : (log.normal_logs?.[0] || log.normal_logs);

              const unifiedLog = { ...log, ...(details || {}) };
              totalFood += unifiedLog.food_amount || 0;

              if (unifiedLog.urine_level || unifiedLog.stool_level) {
                totalLitter += 1;
              }

              const analysis = analyzeHealthLog(unifiedLog);
              if (!worstAnalysis || analysis.redFlags > worstAnalysis.redFlags || analysis.score < worstAnalysis.score) {
                worstAnalysis = analysis;
                latestLogForPosture = unifiedLog;
              }
            });

            newData.food = totalFood;
            newData.litter = totalLitter;

            if (worstAnalysis && latestLogForPosture) {
              if (worstAnalysis.redFlags > 0) {
                newData.posture.abnormal = {
                  percent: worstAnalysis.score < 50 ? 80 : 40,
                  name: latestLogForPosture.behavior || worstAnalysis.alerts[0] || 'At Risk'
                };
                newData.posture.normal = {
                  percent: 100 - newData.posture.abnormal.percent,
                  name: 'Low Activity'
                };
              } else {
                newData.posture.normal = {
                  percent: worstAnalysis.score,
                  name: latestLogForPosture.behavior === 'normal' ? 'Active' : (latestLogForPosture.behavior || 'Normal')
                };
                newData.posture.abnormal = {
                  percent: 100 - worstAnalysis.score,
                  name: 'None'
                };
              }
            }
          }
        }

        // 3. Fetch Behavior Analytics (Bypassing for speed on physical devices)
        /* 
        try {
          const API_URL = "http://10.0.2.2:3000/api/analytics/behavior";
          const res = await fetch(API_URL, { ... });
          ...
        } catch (apiErr) { ... }
        */
      }

      setData(newData);
      setLastUpdated(new Date());

    } catch (e) {
      console.error("Error fetching camera data:", e);
      setData(prev => prev || newData);
    }
  }, [session, data]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Simulate live camera stats when connected
  useEffect(() => {
    if (cameraStatus !== 'connected') return;

    const interval = setInterval(() => {
      setData(prev => {
        if (!prev) return prev;

        let newRecent = [...(prev.recentActivities || [
          { id: 1, type: 'active', time: '2m ago', icon: 'run', color: '#00FF00' },
          { id: 2, type: 'eating', time: '15m ago', icon: 'food', color: '#FFC800' },
          { id: 3, type: 'grooming', time: '45m ago', icon: 'paw', color: '#00C8FF' },
          { id: 4, type: 'toileting', time: '1h ago', icon: 'emoticon-poop', color: '#FF9600' },
          { id: 5, type: 'resting', time: '3h ago', icon: 'sleep', color: '#C8C8C8' }
        ])];

        if (Math.random() > 0.8 && newRecent.length > 0) {
          newRecent[0] = { ...newRecent[0], time: 'Just now' };
        }

        const newFood = prev.food + (Math.random() > 0.8 ? 1 : 0);
        const newLitter = prev.litter + (Math.random() > 0.95 ? 1 : 0);

        const act = [...(prev.activity || [20, 45, 10, 80, 50])];
        if (Math.random() > 0.3) {
          act[4] = Math.min(100, Math.max(0, act[4] + (Math.floor(Math.random() * 11) - 5)));
        }

        let norm = prev.posture.normal.percent;
        if (Math.random() > 0.4) {
          const diff = Math.floor(Math.random() * 7) - 3;
          norm = Math.min(100, Math.max(0, norm + diff));
        }

        return {
          ...prev,
          recentActivities: newRecent,
          food: newFood,
          litter: newLitter,
          activity: act,
          posture: {
            normal: { ...prev.posture.normal, percent: norm, name: prev.posture.normal.name || 'Normal' },
            abnormal: { ...prev.posture.abnormal, percent: 100 - norm, name: prev.posture.abnormal.name || 'None' }
          }
        };
      });
      setLastUpdated(new Date());
    }, 4000);

    return () => clearInterval(interval);
  }, [cameraStatus]);

  return { data, lastUpdated, refetch: fetchData };
}
