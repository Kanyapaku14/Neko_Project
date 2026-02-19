import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import supabase from '../screens/config/supabaseClient';

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
        abnormal: { percent: 2, name: 'None' },
        normal: { percent: 98, name: 'Sleep' }
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
        const { count, error: countError } = await supabase
          .from('cats')
          .select('*', { count: 'exact', head: true })
          .eq('owner_id', session.user.id);

        if (!countError) {
          newData.cats = count || 0;
        }

        // B. Get Latest Daily Log (Food & Behavior)
        // Find cats first
        const { data: catsData } = await supabase
          .from('cats')
          .select('id')
          .eq('owner_id', session.user.id);

        if (catsData && catsData.length > 0) {
          const catIds = catsData.map(c => c.id);

          // Query logs for these cats
          const { data: logs } = await supabase
            .from('daily_logs')
            .select('*')
            .in('cat_id', catIds)
            .order('log_date', { ascending: false }) // Latest first
            .limit(1);

          if (logs && logs.length > 0) {
            const log = logs[0];

            // Map Food (Grams)
            newData.food = log.food_intake || 0;

            // Map Behavior -> Posture
            // 'lethargic', 'hiding', 'hunched', 'aggressive', 'painful_vocal' -> Abnormal
            const badBehaviors = ['lethargic', 'hiding', 'hunched', 'aggressive', 'painful_vocal'];

            if (log.behavior_enum && badBehaviors.includes(log.behavior_enum)) {
              // Risk detected
              newData.posture.abnormal = { percent: 85, name: log.behavior_enum };
              newData.posture.normal = { percent: 15, name: 'Low Activity' };
            } else if (log.behavior_enum) {
              // Normal behavior
              newData.posture.normal = { percent: 95, name: log.behavior_enum };
              newData.posture.abnormal = { percent: 5, name: 'None' };
            }
          }
        }
      }

      setData(newData);

    } catch (e) {
      console.error("Error fetching camera data:", e);
      // Fallback to basic data on error
      setData(prev => prev || newData);
    }
  }, [session]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Expose refetch if needed
  return { data, refetch: fetchData };
}
