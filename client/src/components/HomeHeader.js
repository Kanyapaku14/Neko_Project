import React, { useState, useEffect } from "react";
import { View, Text, Image, TouchableOpacity, DeviceEventEmitter } from "react-native";
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

  useEffect(() => {
    fetchCats();
  }, []);

  const fetchCats = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { data: catData, error } = await supabase
        .from('cats')
        .select('*')
        .eq('owner_id', session.user.id);

      if (error) throw error;

      if (catData && catData.length > 0) {
        setCats(catData);

        // Load selected cat from storage
        const storedCatId = await AsyncStorage.getItem('selectedCatId');
        if (storedCatId) {
          const found = catData.find(c => c.id.toString() === storedCatId);
          const currentCat = found || catData[0];
          setActiveCat(currentCat);
          DeviceEventEmitter.emit('catChanged', currentCat);
        } else {
          setActiveCat(catData[0]);
          await AsyncStorage.setItem('selectedCatId', catData[0].id.toString());
          DeviceEventEmitter.emit('catChanged', catData[0]);
        }
      }
    } catch (err) {
      console.log('Error fetching cats for header:', err.message);
    }
  };

  const selectCat = async (cat) => {
    setActiveCat(cat);
    setModalVisible(false);
    await AsyncStorage.setItem('selectedCatId', cat.id.toString());

    // Broadcast the change to other screens!
    DeviceEventEmitter.emit('catChanged', cat);
  };

  return (
    <View style={styles.headerBg}>
      {/* ซ้าย: โปรไฟล์ หรือ Custom Component */}
      <View style={{ width: 44, alignItems: 'flex-start' }}>
        {leftComponent ? leftComponent : (
          <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.catDropdownTrigger}>
            <View style={[styles.avatar, { backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }]}>
              {activeCat?.image_url ? (
                <Image source={{ uri: activeCat.image_url }} style={{ width: '100%', height: '100%' }} />
              ) : (
                <Ionicons name="paw" size={20} color="#718096" />
              )}
            </View>
            <Ionicons name="chevron-down" size={16} color="#718096" style={{ marginLeft: 4 }} />
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
      <View style={{ width: leftComponent ? 44 : 80, alignItems: 'flex-end' }}>
        {rightComponent ? rightComponent : (
          <View style={styles.iconGroup}>
            <TouchableOpacity style={styles.iconBtn} onPress={onNotify}>
              <Ionicons name="notifications-outline" size={20} color="#718096" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={onSetting}>
              <Ionicons name="settings-outline" size={20} color="#718096" />
            </TouchableOpacity>
          </View>
        )}
      </View>

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
