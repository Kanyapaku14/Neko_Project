import React from "react";
import { View, Text, Image, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import styles from "../styles/homeStyles";

export default function HomeHeader({
  onProfile,
  onNotify,
  onSetting,
  userProfile,
  leftComponent,
  centerComponent,
  rightComponent
}) {

  return (
    <View style={styles.headerBg}>
      {/* ซ้าย: โปรไฟล์ หรือ Custom Component */}
      <View style={{ width: 44, alignItems: 'flex-start' }}>
        {leftComponent ? leftComponent : (
          <TouchableOpacity onPress={onProfile}>
            <View style={[styles.avatar, { backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }]}>
              {userProfile?.avatar_url ? (
                <Image source={{ uri: userProfile.avatar_url }} style={{ width: '100%', height: '100%' }} />
              ) : (
                <Ionicons name="person" size={20} color="#718096" />
              )}
            </View>
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
    </View>
  );
}
