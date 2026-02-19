import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, TextInput, ScrollView, Image, Alert, Platform } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from 'expo-linear-gradient';
// เพิ่ม Library จัดการขอบจอ
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import supabase from "./config/supabaseClient";
import { styles } from './Style/LogDailyStyle';

// --- Shared Utilities ---
const getLevelValue = (level) => {
    switch (level) {
        case 5: return "very_high";
        case 4: return "high";
        case 3: return "normal";
        case 2: return "low";
        case 1: return "very_low";
        default: return null;
    }
};

const formatToEnum = (val) => val ? String(val).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') : null;

// --- Custom Component: กล่องกรอกตัวเลขพร้อมหน่วยข้างใน ---
const UnitInput = ({ value, onChangeText, unit, width }) => (
    <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#C8DDD8',
        borderRadius: 8,
        height: 38,
        width: width || 100,
        paddingHorizontal: 8
    }}>
        <TextInput
            style={{
                fontSize: 14,
                color: '#000',
                padding: 0,
                textAlign: 'right',
                minWidth: 15,
                height: '100%'
            }}
            placeholder="0"
            placeholderTextColor="#999"
            keyboardType="numeric"
            value={value}
            onChangeText={onChangeText}
        />
        <Text style={{ fontSize: 14, color: '#999', marginLeft: 4 }}>{unit}</Text>
    </View>
);

// --- Custom Component: Semantic-UI Style Dropdown ---
const CustomDropdown = ({ value, onValueChange }) => {
    const [isOpen, setIsOpen] = useState(false);

    const options = [
        { label: 'Dry Food', value: 'dry' },
        { label: 'Wet Food', value: 'wet' },
        { label: 'BARF', value: 'barf' }
    ];

    const selectedLabel = options.find(opt => opt.value === value)?.label || "Select kind of food";

    return (
        <View style={{ flex: 1, position: 'relative', zIndex: 100 }}>
            <TouchableOpacity
                activeOpacity={0.8}
                style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: isOpen ? '#85B7D9' : '#C8DDD8',
                    borderRadius: 8,
                    height: 38,
                    paddingHorizontal: 12,
                }}
                onPress={() => setIsOpen(!isOpen)}
            >
                <Text style={{ fontSize: 14, color: value ? '#000' : '#999' }}>{selectedLabel}</Text>
                <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={16} color="#666" />
            </TouchableOpacity>

            {isOpen && (
                <View style={{
                    position: 'absolute',
                    top: 42,
                    left: 0,
                    right: 0,
                    backgroundColor: '#fff',
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: '#C8DDD8',
                    elevation: 5,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.1,
                    shadowRadius: 4,
                    zIndex: 1000,
                }}>
                    {options.map((item, index) => (
                        <TouchableOpacity
                            key={index}
                            style={{
                                paddingVertical: 12,
                                paddingHorizontal: 12,
                                borderBottomWidth: index === options.length - 1 ? 0 : 1,
                                borderBottomColor: '#F0F0F0'
                            }}
                            onPress={() => {
                                // เช็คว่าถ้ากดตัวเดิม ให้เคลียร์ค่า (เป็น null)
                                if (value === item.value) {
                                    onValueChange(null);
                                } else {
                                    onValueChange(item.value);
                                }
                                setIsOpen(false);
                            }}
                        >
                            <Text style={{ fontSize: 14, color: '#333' }}>{item.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
        </View>
    );
};

// ==========================================
// 1. หน้า NormalView
// ==========================================
const NormalView = ({ props, setStatus }) => {
    const { session, onBack, initialDate } = props;
    const insets = useSafeAreaInsets(); // ใช้คำนวณระยะขอบจอ

    const [catId, setCatId] = useState(null);
    const [foodType, setFoodType] = useState(null);
    const [consumeMeals, setConsumeMeals] = useState('');
    const [foodIntake, setFoodIntake] = useState('');
    const [waterIntake, setWaterIntake] = useState('');
    // เปลี่ยนค่าเริ่มต้นเป็น null ทั้งหมด
    const [urineLevel, setUrineLevel] = useState(null);
    const [stoolLevel, setStoolLevel] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => { if (session?.user) fetchCatId(); }, [session]);

    const fetchCatId = async () => {
        const { data } = await supabase.from('cats').select('id').eq('owner_id', session.user.id).single();
        if (data) setCatId(data.id);
    };

    const handleSave = async () => {
        if (!catId) return Alert.alert("Error", "No cat profile found");
        setLoading(true);
        const logDate = initialDate ? new Date(initialDate) : new Date();

        const payload = {
            cat_id: catId,
            log_date: `${logDate.getFullYear()}-${String(logDate.getMonth() + 1).padStart(2, '0')}-${String(logDate.getDate()).padStart(2, '0')}`,
            food_type_enum: foodType,
            meals_per_day: Number(consumeMeals) || 0,
            food_intake: Number(foodIntake) || 0,
            water_level: Number(waterIntake) || 0,
            urine_level_enum: getLevelValue(urineLevel),
            stool_level_enum: getLevelValue(stoolLevel),
            vomit_level_enum: null,
            urine_color_enum: null,
            stool_color_enum: null,
            behavior_enum: null,
        };

        const { error } = await supabase.from('daily_logs').upsert(payload, { onConflict: 'cat_id, log_date' });
        setLoading(false);
        if (error) Alert.alert('Error', error.message);
        else Alert.alert('Success', 'Saved Event!', [{ text: 'OK', onPress: onBack }]);
    };

    const theme = { cardBg: '#DCECE7', borderColor: '#C8DDD8', textDark: '#1A3B34', textLabel: '#333' };

    return (
        <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
            <LinearGradient
                colors={['#FFFFFF', '#B2E1DB']}
                locations={[0.42, 1]}
                style={{ flex: 1, paddingTop: Math.max(insets.top, 20) }} // หลบขอบจอด้านบน
            >
                <View style={[styles.header, { paddingHorizontal: 15 }]}>
                    <TouchableOpacity onPress={onBack} style={{ padding: 5 }}>
                        <Ionicons name="chevron-back" size={28} color="#000" />
                    </TouchableOpacity>
                    <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1A3B34' }}>daily log</Text>
                    <View style={{ width: 38 }} />
                </View>

                <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: 20, paddingBottom: insets.bottom + 20 }]}>
                    <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#1A3B34', textAlign: 'center', marginBottom: 20 }}>
                        How was <Text style={{ color: '#4CAF50' }}>Luna</Text> today
                    </Text>

                    {/* Status Toggle */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
                        <TouchableOpacity style={{ backgroundColor: '#82CDBB', borderRadius: 16, width: '48%', paddingVertical: 15, alignItems: 'center', elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3 }}>
                            <View style={{ backgroundColor: '#fff', borderRadius: 30, width: 55, height: 55, justifyContent: 'center', alignItems: 'center', marginBottom: 8 }}>
                                <MaterialCommunityIcons name="cat" size={40} color="#000" />
                            </View>
                            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#000' }}>Normal</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={{ backgroundColor: '#A5D6C9', borderRadius: 16, width: '48%', paddingVertical: 15, alignItems: 'center', opacity: 0.8 }} onPress={() => setStatus('Something off')}>
                            <View style={{ backgroundColor: '#fff', borderRadius: 30, width: 55, height: 55, justifyContent: 'center', alignItems: 'center', marginBottom: 8 }}>
                                <MaterialCommunityIcons name="emoticon-sad-outline" size={40} color="#000" />
                            </View>
                            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#000' }}>Something off</Text>
                        </TouchableOpacity>
                    </View>

                    {/* --- Food Section --- */}
                    <View style={{ backgroundColor: theme.cardBg, borderRadius: 16, padding: 15, marginBottom: 15, borderWidth: 1, borderColor: theme.borderColor, zIndex: 10 }}>
                        <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 15, color: theme.textDark }}>Food</Text>

                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15, zIndex: 100 }}>
                            <Text style={{ width: 60, fontSize: 14, color: theme.textLabel }}>Type :</Text>
                            <CustomDropdown value={foodType} onValueChange={setFoodType} />
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }}>
                            <Text style={{ width: 85, fontSize: 14, color: theme.textLabel }}>Consume</Text>
                            <UnitInput value={consumeMeals} onChangeText={setConsumeMeals} unit="meals" width={110} />
                            <Text style={{ fontSize: 14, color: theme.textLabel, marginLeft: 8 }}>per day.</Text>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={{ width: 105, fontSize: 14, color: theme.textLabel }}>Total quantity:</Text>
                            <UnitInput value={foodIntake} onChangeText={setFoodIntake} unit="g" width={100} />
                        </View>
                    </View>

                    {/* --- Water Section --- */}
                    <View style={{ backgroundColor: theme.cardBg, borderRadius: 16, padding: 15, marginBottom: 15, borderWidth: 1, borderColor: theme.borderColor }}>
                        <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 15, color: theme.textDark }}>Water</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={{ width: 105, fontSize: 14, color: theme.textLabel }}>Total quantity:</Text>
                            <UnitInput value={waterIntake} onChangeText={setWaterIntake} unit="ml" width={110} />
                            <Text style={{ fontSize: 14, color: theme.textLabel, marginLeft: 8 }}>per day.</Text>
                        </View>
                    </View>

                    {/* --- Urine & Stool Section --- */}
                    <View style={{ backgroundColor: theme.cardBg, borderRadius: 16, padding: 15, marginBottom: 20, borderWidth: 1, borderColor: theme.borderColor }}>
                        <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 15, color: theme.textDark }}>Urine</Text>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            {[{ level: 5, label: "Very High" }, { level: 4, label: "High" }, { level: 3, label: "Normal" }, { level: 2, label: "Low" }, { level: 1, label: "VeryLow" }
                            ].map((item) => {
                                const isActive = urineLevel === item.level;
                                return (
                                    <TouchableOpacity
                                        key={`urine-${item.level}`}
                                        style={{ alignItems: 'center', width: 70 }}
                                        onPress={() => setUrineLevel(urineLevel === item.level ? null : item.level)} // กดซ้ำเพื่อเคลียร์ค่า
                                    >
                                        <View style={[
                                            { width: 60, height: 60, justifyContent: 'center', alignItems: 'center', borderRadius: 16 },
                                            isActive ? {} : {}
                                        ]}>
                                            <Image source={require('../../assets/Urine.png')} style={{ width: 50, height: 50, opacity: isActive ? 1 : 0.45 }} resizeMode="contain" />
                                        </View>
                                        <Text style={{ fontSize: 12, marginTop: 8, color: isActive ? theme.textDark : '#8E9E9B', fontWeight: isActive ? 'bold' : '500', textAlign: 'center' }}>{item.label}</Text>
                                    </TouchableOpacity>
                                )
                            })}
                        </View>

                        <View style={{ height: 1, backgroundColor: theme.borderColor, marginVertical: 20 }} />

                        <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 15, color: theme.textDark }}>Stool</Text>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            {[{ level: 5, label: "Very High" }, { level: 4, label: "High" }, { level: 3, label: "Normal" }, { level: 2, label: "Low" }, { level: 1, label: "VeryLow" }
                            ].map((item) => {
                                const isActive = stoolLevel === item.level;
                                return (
                                    <TouchableOpacity
                                        key={`stool-${item.level}`}
                                        style={{ alignItems: 'center', width: 60 }}
                                        onPress={() => setStoolLevel(stoolLevel === item.level ? null : item.level)} // กดซ้ำเพื่อเคลียร์ค่า
                                    >
                                        <View style={[
                                            { width: 60, height: 60, justifyContent: 'center', alignItems: 'center', borderRadius: 16 },
                                            isActive ? {
                                            } : {
                                            }
                                        ]}>
                                            <Image source={require('../../assets/Stool.png')} style={{ width: 50, height: 50, opacity: isActive ? 1 : 0.35 }} resizeMode="contain" />
                                        </View>
                                        <Text style={{ fontSize: 12, marginTop: 8, color: isActive ? theme.textDark : '#8E9E9B', fontWeight: isActive ? 'bold' : '500', textAlign: 'center' }}>{item.label}</Text>
                                    </TouchableOpacity>
                                )
                            })}
                        </View>
                    </View>

                    {/* --- Save Button --- */}
                    <TouchableOpacity style={{ backgroundColor: '#A5D6C9', borderRadius: 12, height: 55, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20 }} onPress={handleSave} disabled={loading}>
                        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#fff', marginRight: 8 }}>{loading ? "Saving..." : "Save Event"}</Text>
                        <Ionicons name="checkmark-circle-outline" size={24} color="#fff" />
                    </TouchableOpacity>
                </ScrollView>
            </LinearGradient>
        </View>
    );
};

// ==========================================
// 2. หน้า SomethingOffView
// ==========================================
const SomethingOffView = ({ props, setStatus }) => {
    const { session, onBack, initialDate } = props;
    const insets = useSafeAreaInsets(); // ใช้คำนวณระยะขอบจอ

    const [catId, setCatId] = useState(null);
    const [vomitLevel, setVomitLevel] = useState(null); // เปลี่ยนเป็น null
    const [vomitColor, setVomitColor] = useState(null); // เปลี่ยนเป็น null
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => { if (session?.user) fetchCatId(); }, [session]);

    const fetchCatId = async () => {
        const { data } = await supabase.from('cats').select('id').eq('owner_id', session.user.id).single();
        if (data) setCatId(data.id);
    };

    const handleSave = async () => {
        setLoading(true);
        const logDate = initialDate ? new Date(initialDate) : new Date();
        const payload = {
            cat_id: catId,
            log_date: `${logDate.getFullYear()}-${String(logDate.getMonth() + 1).padStart(2, '0')}-${String(logDate.getDate()).padStart(2, '0')}`,
            vomit_level_enum: getLevelValue(vomitLevel),
            vomit_color_enum: formatToEnum(vomitColor),
            notes: notes || null,
        };
        const { error } = await supabase.from('daily_logs').upsert(payload, { onConflict: 'cat_id, log_date' });
        setLoading(false);
        if (error) Alert.alert('Error', error.message);
        else Alert.alert('Success', 'Saved!', [{ text: 'OK', onPress: onBack }]);
    };

    const theme = { cardBg: '#DCECE7', borderColor: '#C8DDD8', textDark: '#1A3B34' };

    return (
        <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
            <LinearGradient
                colors={['#FFFFFF', '#B2E1DB']}
                locations={[0.42, 1]}
                style={{ flex: 1, paddingTop: Math.max(insets.top, 20) }} // หลบขอบจอด้านบน
            >
                <View style={[styles.header, { paddingHorizontal: 15 }]}>
                    <TouchableOpacity onPress={onBack} style={{ padding: 5 }}>
                        <Ionicons name="chevron-back" size={28} color="#000" />
                    </TouchableOpacity>
                    <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1A3B34' }}>daily log</Text>
                    <View style={{ width: 38 }} />
                </View>

                <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: 20, paddingBottom: insets.bottom + 20 }]}>
                    <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#1A3B34', textAlign: 'center', marginBottom: 20 }}>
                        How was <Text style={{ color: '#FF9800' }}>Luna</Text> today
                    </Text>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
                        <TouchableOpacity style={{ backgroundColor: '#A5D6C9', borderRadius: 16, width: '48%', paddingVertical: 15, alignItems: 'center', opacity: 0.8 }} onPress={() => setStatus('Normal')}>
                            <View style={{ backgroundColor: '#fff', borderRadius: 30, width: 55, height: 55, justifyContent: 'center', alignItems: 'center', marginBottom: 8 }}>
                                <MaterialCommunityIcons name="cat" size={40} color="#000" />
                            </View>
                            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#000' }}>Normal</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={{ backgroundColor: '#82CDBB', borderRadius: 16, width: '48%', paddingVertical: 15, alignItems: 'center', elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3 }}>
                            <View style={{ backgroundColor: '#fff', borderRadius: 30, width: 55, height: 55, justifyContent: 'center', alignItems: 'center', marginBottom: 8 }}>
                                <MaterialCommunityIcons name="emoticon-sad-outline" size={40} color="#000" />
                            </View>
                            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#000' }}>Something off</Text>
                        </TouchableOpacity>
                    </View>

                    {/* --- Vomit Section --- */}
                    <View style={{ backgroundColor: theme.cardBg, borderRadius: 16, padding: 15, marginBottom: 20, borderWidth: 1, borderColor: theme.borderColor }}>
                        <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 15, color: theme.textDark }}>Vomit Color</Text>
                        <View style={styles.gridContainer}>
                            {[{ label: 'Yellow Foam', value: 'yellow_foam' }, { label: 'White Mucus', value: 'white_mucus' }, { label: 'Red', value: 'red' }
                            ].map((item, index) => {
                                const isActive = vomitColor === item.value;
                                return (
                                    <TouchableOpacity
                                        key={index}
                                        style={styles.gridItem}
                                        onPress={() => setVomitColor(vomitColor === item.value ? null : item.value)} // กดซ้ำเพื่อเคลียร์ค่า
                                    >
                                        <View style={[styles.gridIconBtn, isActive && styles.gridIconBtnActiveOrange]}>
                                            <Image source={require('../../assets/Stool_Color.png')} style={[styles.iconImg, { width: 45, height: 45 }, !isActive && { opacity: 0.4 }]} />
                                        </View>
                                        <Text style={styles.gridLabel}>{item.label}</Text>
                                    </TouchableOpacity>
                                )
                            })}
                        </View>
                    </View>

                    <TouchableOpacity style={{ backgroundColor: '#A5D6C9', borderRadius: 12, height: 55, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20 }} onPress={handleSave} disabled={loading}>
                        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#fff', marginRight: 8 }}>{loading ? "Saving..." : "Save Event"}</Text>
                        <Ionicons name="checkmark-circle-outline" size={24} color="#fff" />
                    </TouchableOpacity>
                </ScrollView>
            </LinearGradient>
        </View>
    );
};

// ==========================================
// 3. Main Export
// ==========================================
export default function LogDaily(props) {
    const [status, setStatus] = useState('Normal');
    return status === 'Normal' ? <NormalView props={props} setStatus={setStatus} /> : <SomethingOffView props={props} setStatus={setStatus} />;
}