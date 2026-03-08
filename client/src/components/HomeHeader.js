import React, { useState, useEffect } from "react";
import { View, Text, Image, TouchableOpacity, DeviceEventEmitter, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from '@react-native-async-storage/async-storage';
import supabase from "../screens/config/supabaseClient";
import styles from "../styles/homeStyles";
import DropdownProfile from "./DropdownProfile";


export default function HomeHeader({
  onProfile,
  onNotify,
  onSetting,
  userProfile,
  leftComponent,
  centerComponent,
  rightComponent
}) {
  const [cats, setCats] = useState([]);
  const [activeCat, setActiveCat] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [isSwitchingCat, setIsSwitchingCat] = useState(false);

  useEffect(() => {
    fetchCats();
  }, []);

  const fetchCats = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const selectedCatKey = `selectedCatId:${session.user.id}`;

      const { data: catData, error } = await supabase
        .from('cats')
        .select('*')
        .eq('owner_id', session.user.id);

      if (error) throw error;

      if (catData && catData.length > 0) {
        setCats(catData);

        // Load selected cat from storage
        const storedCatId =
          (await AsyncStorage.getItem(selectedCatKey)) ||
          (await AsyncStorage.getItem('selectedCatId'));
        if (storedCatId) {
          const found = catData.find(c => c.id.toString() === storedCatId);
          const currentCat = found || catData[0];
          setActiveCat(currentCat);
          DeviceEventEmitter.emit('catChanged', currentCat);
        } else {
          setActiveCat(catData[0]);
          await AsyncStorage.setItem(selectedCatKey, catData[0].id.toString());
          DeviceEventEmitter.emit('catChanged', catData[0]);
        }
      }
    } catch (err) {
      console.log('Error fetching cats for header:', err.message);
    }
  };

  const selectCat = async (cat) => {
    if (!cat?.id) return;
    if (activeCat?.id && String(activeCat.id) === String(cat.id)) {
      setModalVisible(false);
      return;
    }
    setIsSwitchingCat(true);
    try {
      setActiveCat(cat);
      setModalVisible(false);
      const { data: { session } } = await supabase.auth.getSession();
      const selectedCatKey = session?.user?.id ? `selectedCatId:${session.user.id}` : 'selectedCatId';
    const scopedLastCatKey = session?.user?.id ? `last_selected_cat_id:${session.user.id}` : 'last_selected_cat_id';
    await AsyncStorage.multiSet([
      [selectedCatKey, cat.id.toString()],
      ['selectedCatId', cat.id.toString()],
      [scopedLastCatKey, cat.id.toString()],
      ['last_selected_cat_id', cat.id.toString()],
    ]);

      // Broadcast the change to other screens
      DeviceEventEmitter.emit('catChanged', cat);
      await new Promise((resolve) => setTimeout(resolve, 350));
    } finally {
      setIsSwitchingCat(false);
    }
  };

  return (
    <View style={styles.headerBg}>
      {/* ซ้าย: โปรไฟล์ หรือ Custom Component */}
      <View style={{ width: 44, alignItems: 'flex-start' }}>
        {leftComponent ? leftComponent : (
          <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.catDropdownTrigger} disabled={isSwitchingCat}>
            <View style={[styles.avatar, { backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }]}>
              {activeCat?.image_url ? (
                <Image source={{ uri: activeCat.image_url }} style={{ width: '100%', height: '100%' }} />
              ) : (
                <Ionicons name="paw" size={20} color="#718096" />
              )}
            </View>
            {isSwitchingCat ? (
              <ActivityIndicator size="small" color="#26A69A" style={{ marginLeft: 6 }} />
            ) : (
              <Ionicons name="chevron-down" size={16} color="#718096" style={{ marginLeft: 4 }} />
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* กลาง: Brand Logo หรือ Custom Component */}
      <View style={styles.titleContainer} pointerEvents="none">
        {centerComponent ? centerComponent : (
          <>
            <Text style={styles.title}>NEK</Text>
            <Ionicons name="paw" size={14} color="#4FD1C5" />
            <Text style={styles.title}>CARE</Text>
          </>
        )}
      </View>

      {/* ขวา: Icons หรือ Custom Component */}
      <View style={rightComponent ? { minWidth: 44, alignItems: 'flex-end' } : { width: leftComponent ? 44 : 80, alignItems: 'flex-end' }}>
        {rightComponent ? rightComponent : (
          <View style={styles.iconGroup}>
            <TouchableOpacity style={styles.iconBtn} onPress={onNotify} disabled={isSwitchingCat}>
              <Ionicons name="notifications-outline" size={20} color="#718096" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={onSetting} disabled={isSwitchingCat}>
              <Ionicons name="settings-outline" size={20} color="#718096" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {isSwitchingCat && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: -8,
            alignItems: 'center',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: 'rgba(38,166,154,0.12)',
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}
          >
            <ActivityIndicator size="small" color="#26A69A" />
            <Text style={{ marginLeft: 6, fontSize: 11, color: '#00695C', fontFamily: 'Inter-Medium' }}>
              Switching cat...
            </Text>
          </View>
        </View>
      )}

      {/* Component ดรอปดาวน์สำหรับเลือกแมว */}
      <DropdownProfile
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        cats={cats}
        activeCat={activeCat}
        onSelectCat={selectCat}
      />
    </View>
  );
}
