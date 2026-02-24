import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import supabase from '../screens/config/supabaseClient';
import { analyzeHealthLog } from '../utils/healthLogic';

export default function useCameraData(session) {
  const [data, setData] = useState(null);

  const fetchData = useCallback(async () => {
    // Default structure (matches UI expectations)
    let newData = {
      connectedAt: Date.now() - 120000,
      cats: 0,
      food: 0,
      litter: 0,
      activity: [20, 45, 10, 80], // Mock graph data (DB lacks hourly activity)
      posture: {
        abnormal: { percent: 0, name: 'None' },
        normal: { percent: 100, name: 'Normal' }
      },
      settings: { monitoringMode: 'multi', selectedCats: [] }
    };

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
          const catIds = catsData.map(c => c.id);

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

              // Count as "visited" if there's any urine or stool level recorded
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

            // Map Posture based on the most concerning or recent log
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
          } else if (!logsError && logs?.length === 0) {
            // If no logs today, maybe check latest for posture context but keep counters at 0
            // For simplicity, we stick to today's insights as labeled
          }
        }
      }

      setData(newData);

    } catch (e) {
      console.error("Error fetching camera data:", e);
      setData(prev => prev || newData);
    }
  }, [session]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, refetch: fetchData };
}
