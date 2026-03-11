import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, TextInput, ScrollView, Image, Alert, Platform } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import supabase from "./config/supabaseClient";
import { styles } from './Style/LogDailyStyle';
import AlertEngine from '../services/AlertEngine';

// --- Shared Utilities ---
const NO_FOOD_TAG = 'ไม่กินอาหารเลย';
const NO_WATER_TAG = 'ไม่กินน้ำเลย';
const EXCESS_WATER_TAG = 'กินน้ำเยอะผิดปกติ';
const POLYPHAGIA_TAG = 'กินจุผิดปกติ';
const APPETITE_LOSS_TAG = 'เบื่ออาหาร';
const EXTREME_FOOD_CONFIRM_G = 1000;
const FOOD_WARNING_G = 320;
const WATER_MAX_ML = 999;
const WATER_HIGH_ML = 349;
const WATER_ALERT_ML = 399;

const sumMealGrams = (meals = []) => {
    const items = Array.isArray(meals) ? meals : [];
    return items.reduce((sum, meal) => {
        const grams = Number(meal?.amount_grams);
        if (!Number.isFinite(grams)) return sum;
        return sum + grams;
    }, 0);
};

const formatNumber = (n) => {
    const num = Number(n);
    if (!Number.isFinite(num)) return String(n ?? '');
    return String(Math.round(num)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

const sanitizeUpTo3Digits = (text) => {
    const digits = String(text ?? '').replace(/\D/g, '').slice(0, 3);
    return digits;
};

const confirmDialog = (title, message, okText = 'ยืนยัน') =>
    new Promise((resolve) => {
        Alert.alert(
            title,
            message,
            [
                { text: 'แก้ไข', style: 'cancel', onPress: () => resolve(false) },
                { text: okText, onPress: () => resolve(true) },
            ],
            { cancelable: true }
        );
    });

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
const UnitInput = ({ value, onChangeText, unit, width, maxLength, borderColor, onEndEditing, editable }) => (
    <View style={{
        flexDirection: 'row',
        alignItems: 'center',

        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: borderColor || '#C8DDD8',
        borderRadius: 8,
        height: 38,
        width: width || 100,
        paddingHorizontal: 6
    }}>
        <TextInput
            style={{
                flex: 1, // ✨ เพิ่ม flex: 1 เพื่อให้ TextInput กินพื้นที่ฝั่งซ้ายทั้งหมด
                fontSize: 14,
                color: '#000',
                padding: 0,
                textAlign: 'right', // ตัวเลขจะชิดขวาไปหาหน่วยพอดี
                height: '100%'
            }}
            placeholder="0"
            placeholderTextColor="#999"
            keyboardType="numeric"
            maxLength={maxLength}
            value={value !== null && value !== undefined ? String(value) : ""}
            onChangeText={onChangeText}
            onEndEditing={onEndEditing}
            editable={editable !== false}
        />
        <Text style={{ fontSize: 13, color: '#999', marginLeft: 4 }}>
            {unit}
        </Text>
    </View>
);

// --- Custom Component: Semantic-UI Style Dropdown ---
const CustomDropdown = ({ value, onValueChange }) => {
    const [isOpen, setIsOpen] = useState(false);

    const options = [
        { label: 'Dry Food', value: 'dry_food' },
        { label: 'Wet Food', value: 'wet_food' },
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

const NormalView = ({ props, setStatus, state, setters, handleSave, loading }) => { 
    const { session, onBack, initialDate } = props;
    const insets = useSafeAreaInsets(); // ใช้คำนวณระยะขอบจอ

    const {
        meals, consumeMeals, waterIntake, urineLevel, stoolLevel, catName, behaviorTags, catWeightKg
    } = state;

    const {
        setMeals, setConsumeMeals, setWaterIntake, setUrineLevel, setStoolLevel
    } = setters;

    const hasNoFood = Array.isArray(behaviorTags) && behaviorTags.includes(NO_FOOD_TAG);
    const hasNoWater = Array.isArray(behaviorTags) && behaviorTags.includes(NO_WATER_TAG);

    const handleAddMeal = () => {
        if (hasNoFood) {
            Alert.alert('ข้อมูลขัดแย้งกัน', 'คุณเลือก "ไม่กินอาหารเลย" อยู่ จึงไม่สามารถเพิ่มรายการอาหารได้');
            return;
        }
        setMeals([...meals, { id: Date.now().toString(), food_type: null, amount_grams: "" }]);
    };

    const handleUpdateMeal = (id, field, value) => {
        setMeals(meals.map(meal => meal.id === id ? { ...meal, [field]: value } : meal));
    };

    const handleRemoveMeal = (id) => {
        if (meals.length > 1) {
            setMeals(meals.filter(meal => meal.id !== id));
        } else {
            setMeals([{ id: Date.now().toString(), food_type: null, amount_grams: "" }]);
        }
    };

    const mealsArray = Array.isArray(meals) ? meals : [];
    const hasInvalidMeals = !hasNoFood && (mealsArray.length === 0 || mealsArray.some(m => m.food_type === null || m.amount_grams === null || String(m.amount_grams).trim() === ''));
    const isComplete = !hasInvalidMeals &&
        (hasNoFood || (consumeMeals !== null && String(consumeMeals).trim() !== '')) &&
        (hasNoWater || (waterIntake !== null && String(waterIntake).trim() !== '')) &&
        urineLevel !== null &&
        stoolLevel !== null;

    // Simplified: No internal fetchCatId or handleSave needed as they are lifted to LogDaily 
 
    const theme = { cardBg: '#DCECE7', borderColor: '#C8DDD8', textDark: '#1A3B34', textLabel: '#333' }; 
    const warnedMealIdsRef = useRef(new Set()); 
    const warnedWaterRef = useRef(false);
    const recommendedWaterMl = Math.round((Number(catWeightKg) || 4) * 60); 
    const waterNow = Number(waterIntake);
    const hasWaterNow = Number.isFinite(waterNow);
    const waterBorderColor =
        !hasNoWater && hasWaterNow && waterNow >= WATER_ALERT_ML ? '#B42318' :
            (!hasNoWater && hasWaterNow && waterNow > WATER_HIGH_ML ? '#F59E0B' : undefined);

    useEffect(() => {
        if (!Number.isFinite(Number(waterIntake)) || Number(waterIntake) < WATER_ALERT_ML) {
            warnedWaterRef.current = false;
        }
    }, [waterIntake]);

    return (
        <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
            <StatusBar style="dark" translucent backgroundColor="transparent" />
            <LinearGradient
                colors={['#FFFFFF', '#B2E1DB']}
                locations={[0.42, 1]}
                style={{ flex: 1 }}
            >

                <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                    <TouchableOpacity onPress={onBack} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={28} color="#333" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Daily Log</Text>
                    <TouchableOpacity style={[styles.backButton, { alignItems: 'flex-end' }]}>
                        <Ionicons name="ellipsis-vertical" size={24} color="transparent" />

                    </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: 20, paddingBottom: insets.bottom + 20 }]}>
                    <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#1A3B34', textAlign: 'center', marginBottom: 20 }}>
                        How was <Text style={{ color: '#4CAF50' }}>{catName || "your cat"}</Text> today
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
                    {hasNoFood && (
                        <Text style={{ marginBottom: 10, color: '#B42318', fontWeight: '700' }}>
                            คุณเลือก "{NO_FOOD_TAG}" อยู่ ระบบจะล็อคการกรอกข้อมูลอาหารเพื่อไม่ให้ข้อมูลขัดแย้งกัน
                        </Text>
                    )}
                    <View
                        pointerEvents={hasNoFood ? 'none' : 'auto'}
                        style={{
                            backgroundColor: theme.cardBg,
                            borderRadius: 16,
                            padding: 15,
                            marginBottom: 15,
                            borderWidth: 1,
                            borderColor: theme.borderColor,
                            zIndex: 10,
                            opacity: hasNoFood ? 0.55 : 1,
                        }}
                    >
                        <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 15, color: theme.textDark }}>Food Meals</Text>

                        {meals.map((meal, index) => (
                            <View key={meal.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, zIndex: 100 - index }}>
                                <View style={{ flex: 1, marginRight: 8 }}>
                                    <CustomDropdown 
                                        value={meal.food_type} 
                                        onValueChange={(val) => handleUpdateMeal(meal.id, 'food_type', val)} 
                                    />
                                </View>
                                <View style={{ marginRight: 8 }}>
                                    {(() => {
                                        const gramsNum = Number(meal.amount_grams);
                                        const isOver = Number.isFinite(gramsNum) && gramsNum > FOOD_WARNING_G;
                                        return (
                                    <UnitInput 
                                        value={meal.amount_grams} 
                                        onChangeText={(val) => handleUpdateMeal(meal.id, 'amount_grams', sanitizeUpTo3Digits(val))} 
                                        onEndEditing={() => {
                                            const now = Number(meal.amount_grams);
                                            if (!Number.isFinite(now) || now <= FOOD_WARNING_G) return;
                                            if (warnedMealIdsRef.current.has(meal.id)) return;
                                            warnedMealIdsRef.current.add(meal.id);
                                            Alert.alert(
                                                'ปริมาณอาหารเกินมาตรฐาน',
                                                `ปริมาณอาหารเกินมาตรฐาน (${FOOD_WARNING_G}g)! โปรดตรวจสอบความถูกต้อง หรือเฝ้าระวังภาวะกินจุผิดปกติ`
                                            );
                                        }}
                                        unit="g" 
                                        width={80} 
                                        maxLength={3}
                                        borderColor={isOver ? '#D32F2F' : undefined}
                                    />
                                        );
                                    })()}
                                </View>
                                <TouchableOpacity 
                                    onPress={() => handleRemoveMeal(meal.id)}
                                    style={{ padding: 6, backgroundColor: '#FFEBEB', borderRadius: 8 }}
                                >
                                    <Ionicons name="trash-outline" size={20} color="#D32F2F" />
                                </TouchableOpacity>
                            </View>
                        ))}

                        <TouchableOpacity 
                            onPress={handleAddMeal}
                            style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 20 }}
                        >
                            <Ionicons name="add-circle" size={20} color="#00796B" style={{ marginRight: 6 }} />
                            <Text style={{ color: '#00796B', fontWeight: 'bold', fontSize: 14 }}>Add a meal</Text>
                        </TouchableOpacity>

                        <View style={{ height: 1, backgroundColor: theme.borderColor, marginBottom: 20 }} />

                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={{ width: 85, fontSize: 14, color: theme.textLabel }}>Consume</Text>
                            <UnitInput value={consumeMeals} onChangeText={(val) => setConsumeMeals(val.replace(/\D/g, ''))} unit="meals" width={85} maxLength={2} />
                            <Text style={{ fontSize: 14, color: theme.textLabel, marginLeft: 8 }}> per day.</Text>
                        </View>
                    </View>

                    {/* --- Water Section --- */}
                    {hasNoWater && (
                        <Text style={{ marginBottom: 10, color: '#B42318', fontWeight: '700' }}>
                            คุณเลือก "{NO_WATER_TAG}" อยู่ ระบบจะล็อคการกรอกข้อมูลน้ำเพื่อไม่ให้ข้อมูลขัดแย้งกัน
                        </Text>
                    )}
                    <View
                        pointerEvents={hasNoWater ? 'none' : 'auto'}
                        style={{
                            backgroundColor: theme.cardBg,
                            borderRadius: 16,
                            padding: 15,
                            marginBottom: 15,
                            borderWidth: 1,
                            borderColor: theme.borderColor,
                            opacity: hasNoWater ? 0.55 : 1,
                        }}
                    > 
                        <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 15, color: theme.textDark }}>Water</Text> 
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}> 
                            <Text style={{ width: 105, fontSize: 14, color: theme.textLabel }}>Total quantity:</Text> 
                            <UnitInput
                                value={waterIntake}
                                onChangeText={(v) => setWaterIntake(sanitizeUpTo3Digits(v))}
                                unit="ml"
                                width={85}
                                maxLength={3}
                                borderColor={waterBorderColor}
                                onEndEditing={() => {
                                    if (hasNoWater) return;
                                    const now = Number(waterIntake);
                                    if (!Number.isFinite(now) || now < WATER_ALERT_ML) return;
                                    if (warnedWaterRef.current) return;
                                    warnedWaterRef.current = true;
                                    Alert.alert(
                                        'ปริมาณน้ำสูงผิดปกติ',
                                        `คุณกรอกปริมาณน้ำ ${formatNumber(now)} ml/วัน\n\nหากมากผิดปกติอาจเสี่ยงโรคไต/เบาหวาน โปรดตรวจสอบความถูกต้องและเฝ้าระวังอาการ`
                                    );
                                }}
                            /> 
                            <Text style={{ fontSize: 14, color: theme.textLabel, marginLeft: 8 }}> per day.</Text> 
                        </View> 
                        <Text style={{ marginTop: 8, fontSize: 12, color: '#607D8B', fontWeight: '600' }}>
                            แนะนำประมาณ {formatNumber(recommendedWaterMl)} ml/วัน (60 ml/กก./วัน) • กรอกได้สูงสุด {WATER_MAX_ML} ml
                        </Text>
                        {!hasNoWater && hasWaterNow && waterNow > WATER_HIGH_ML && (
                            <Text style={{ marginTop: 6, fontSize: 12, fontWeight: '700', color: waterNow >= WATER_ALERT_ML ? '#B42318' : '#B54708' }}>
                                {waterNow >= WATER_ALERT_ML ? 'ดื่มน้ำมากผิดปกติ (ควรเฝ้าระวัง)' : 'เริ่มดื่มน้ำเยอะกว่าปกติ'}
                            </Text>
                        )}
                        
                    </View> 

                    {/* --- Urine & Stool Section --- */}
                    <View style={{ backgroundColor: theme.cardBg, borderRadius: 16, padding: 15, marginBottom: 20, borderWidth: 1, borderColor: theme.borderColor }}>
                        <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 15, color: theme.textDark }}>Urine</Text>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            {[{ level: 5, label: "Very High" }, { level: 4, label: "High" }, { level: 3, label: "Normal" }, { level: 2, label: "Low" }, { level: 1, label: "Very Low" }
                            ].map((item) => {
                                const isActive = urineLevel === item.level;
                                return (
                                    <TouchableOpacity
                                        key={`urine-${item.level}`}
                                        style={{ alignItems: 'center', flex: 1 }}
                                        onPress={() => setUrineLevel(urineLevel === item.level ? null : item.level)}
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
                            {[{ level: 5, label: "Very High" }, { level: 4, label: "High" }, { level: 3, label: "Normal" }, { level: 2, label: "Low" }, { level: 1, label: "Very Low" }
                            ].map((item) => {
                                const isActive = stoolLevel === item.level;
                                return (
                                    <TouchableOpacity
                                        key={`stool-${item.level}`}
                                        style={{ alignItems: 'center', flex: 1 }}
                                        onPress={() => setStoolLevel(stoolLevel === item.level ? null : item.level)}
                                    >
                                        <View style={[
                                            { width: 60, height: 60, justifyContent: 'center', alignItems: 'center', borderRadius: 16 },
                                            isActive ? {} : {}
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
                    <TouchableOpacity
                        style={{
                            backgroundColor: isComplete ? '#00796B' : '#4DB6AC',
                            borderRadius: 12,
                            height: 55,
                            flexDirection: 'row',
                            justifyContent: 'center',
                            alignItems: 'center',
                            marginBottom: 20,
                            opacity: isComplete ? 1 : 0.7
                        }}
                        onPress={handleSave}
                        disabled={loading}
                    >
                        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#fff', marginRight: 8 }}>{loading ? "Saving..." : "Save Event"}</Text>
                        <Ionicons name="checkmark-circle-outline" size={24} color="#fcfcfcff" />
                    </TouchableOpacity>
                </ScrollView>
            </LinearGradient>
        </View >
    );
};

const SomethingOffView = ({ props, setStatus, state, setters, handleSave, loading }) => { 
    const { session, onBack, initialDate } = props;
    const insets = useSafeAreaInsets(); // ใช้คำนวณระยะขอบจอ


    const {
        isVomitChecked, vomitColor,
        isDiarrheaChecked, diarrheaColor,
        behaviorTags, respiratoryTags,
        notes, catName,
        meals, consumeMeals, waterIntake
    } = state;

    const { 
        setIsVomitChecked, setVomitColor, 
        setIsDiarrheaChecked, setDiarrheaColor, 
        setBehaviorTags, setRespiratoryTags, 
        setNotes, 
        setMeals, setConsumeMeals, setWaterIntake 
    } = setters; 

    const totalFoodGrams = sumMealGrams(meals);
    const isNoFoodSelected = Array.isArray(behaviorTags) && behaviorTags.includes(NO_FOOD_TAG);
    const isOverNormalFood = !isNoFoodSelected && totalFoodGrams > FOOD_WARNING_G;

    useEffect(() => {
        if (!isOverNormalFood) return;
        if (!Array.isArray(behaviorTags) || !behaviorTags.includes(APPETITE_LOSS_TAG)) return;
        setBehaviorTags(behaviorTags.filter((t) => t !== APPETITE_LOSS_TAG));
    }, [isOverNormalFood, behaviorTags, setBehaviorTags]);

    const handleToggleTag = (tag, currentTags, setTargetTags) => {
        if (currentTags.includes(tag)) {
            setTargetTags(currentTags.filter(t => t !== tag));
        } else {
            setTargetTags([...currentTags, tag]);
        }
    };

    // ==========================================
    // ✅ NEW: Consistency rules (Clear / Block conflicting data)
    // ==========================================
    const toggleBehaviorTag = async (tag) => { 
        const current = Array.isArray(behaviorTags) ? behaviorTags : []; 
        const isSelected = current.includes(tag); 

        // Prevent conflict: overfeeding vs appetite loss
        if (!isSelected && tag === APPETITE_LOSS_TAG) {
            const foodNow = sumMealGrams(meals);
            const noFoodNow = current.includes(NO_FOOD_TAG);
            if (!noFoodNow && foodNow > FOOD_WARNING_G) {
                Alert.alert(
                    'ข้อมูลขัดแย้งกัน',
                    `เมื่อกรอกปริมาณอาหารรวมเกิน ${FOOD_WARNING_G}g (${formatNumber(foodNow)}g)\nระบบไม่อนุญาตให้เลือก "${APPETITE_LOSS_TAG}"`
                );
                return;
            }
        }

        // Mutual exclusion (appetite loss vs polyphagia)
        if (!isSelected && tag === POLYPHAGIA_TAG && current.includes(APPETITE_LOSS_TAG)) {
            Alert.alert('ข้อมูลขัดแย้งกัน', `ไม่สามารถเลือก "${POLYPHAGIA_TAG}" พร้อม "${APPETITE_LOSS_TAG}" ได้`);
            return;
        }
        if (!isSelected && tag === APPETITE_LOSS_TAG && current.includes(POLYPHAGIA_TAG)) {
            Alert.alert('ข้อมูลขัดแย้งกัน', `ไม่สามารถเลือก "${APPETITE_LOSS_TAG}" พร้อม "${POLYPHAGIA_TAG}" ได้`);
            return;
        }
 
        // Mutual exclusion (water behavior) 
        if (!isSelected) { 
            if (tag === NO_WATER_TAG && current.includes(EXCESS_WATER_TAG)) { 
                Alert.alert('ข้อมูลขัดแย้งกัน', `ไม่สามารถเลือก "${NO_WATER_TAG}" พร้อม "${EXCESS_WATER_TAG}" ได้`); 
                return;
            }
            if (tag === EXCESS_WATER_TAG && current.includes(NO_WATER_TAG)) {
                Alert.alert('ข้อมูลขัดแย้งกัน', `ไม่สามารถเลือก "${EXCESS_WATER_TAG}" พร้อม "${NO_WATER_TAG}" ได้`);
                return;
            }
            if (tag === POLYPHAGIA_TAG && current.includes(NO_FOOD_TAG)) {
                Alert.alert('ข้อมูลขัดแย้งกัน', `ไม่สามารถเลือก "${POLYPHAGIA_TAG}" พร้อม "${NO_FOOD_TAG}" ได้`);
                return;
            }
        }

        // If user sets "no food", clear food inputs to avoid conflict
        if (!isSelected && tag === NO_FOOD_TAG) {
            const totalFood = sumMealGrams(meals);
            const hasAnyFoodInput =
                totalFood > 0 ||
                (Array.isArray(meals) && meals.some((m) => m?.food_type || String(m?.amount_grams || '').trim() !== '')) ||
                (consumeMeals !== null && String(consumeMeals).trim() !== '');

            if (hasAnyFoodInput) {
                const ok = await confirmDialog(
                    'ยืนยันการล้างข้อมูลอาหาร',
                    `คุณเลือก "${NO_FOOD_TAG}" ระบบจะล้างข้อมูลอาหารทั้งหมดเพื่อไม่ให้ข้อมูลขัดแย้งกัน`,
                    'ล้างข้อมูล'
                );
                if (!ok) return;
            }

            setMeals([]);
            setConsumeMeals('0');
        }

        // If user sets "no water", optionally clear water intake
        if (!isSelected && tag === NO_WATER_TAG) {
            const waterNow = Number(waterIntake);
            const hasWaterInput = (waterIntake !== null && String(waterIntake).trim() !== '' && Number.isFinite(waterNow) && waterNow > 0);
            if (hasWaterInput) {
                const ok = await confirmDialog(
                    'ยืนยันการล้างข้อมูลน้ำ',
                    `คุณกรอกปริมาณน้ำ ${formatNumber(waterNow)} ml แล้ว หากเลือก "${NO_WATER_TAG}" ระบบจะปรับค่าเป็น 0 ml`,
                    'ปรับเป็น 0 ml'
                );
                if (!ok) return;
            }
            setWaterIntake('0');
        }

        // Normal toggle behavior tags
        if (isSelected) setBehaviorTags(current.filter((t) => t !== tag));
        else setBehaviorTags([...current, tag]);
    };

    // Simplified: No internal catId or handleSave needed as they are lifted to LogDaily

    const theme = { cardBg: '#FFFDFB', borderColor: '#E8DED6', textDark: '#D46B13', textLabel: '#333' };

    return (
        <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
            <StatusBar style="dark" translucent backgroundColor="transparent" />
            <LinearGradient
                colors={['#FFFFFF', '#FFA869']} // ไล่สีส้มตามดีไซน์
                locations={[0.42, 1]}
                style={{ flex: 1 }}
            >

                <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                    <TouchableOpacity onPress={onBack} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={28} color="#333" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Daily Log</Text>
                    <TouchableOpacity style={[styles.backButton, { alignItems: 'flex-end' }]}>
                        <Ionicons name="ellipsis-vertical" size={24} color="transparent" />

                    </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: 20, paddingBottom: insets.bottom + 20 }]}>
                    <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#1A3B34', textAlign: 'center', marginBottom: 20 }}>
                        How was <Text style={{ color: '#FBC02D' }}>{catName || "your cat"}</Text> today
                    </Text>

                    {/* Status Toggle */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
                        <TouchableOpacity style={{ backgroundColor: '#FDE17A', borderRadius: 16, width: '48%', paddingVertical: 15, alignItems: 'center', opacity: 0.9 }} onPress={() => setStatus('Normal')}>
                            <View style={{ backgroundColor: '#fff', borderRadius: 30, width: 55, height: 55, justifyContent: 'center', alignItems: 'center', marginBottom: 8 }}>
                                <MaterialCommunityIcons name="cat" size={40} color="#000" />
                            </View>
                            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#000' }}>Normal</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={{ backgroundColor: '#FAD231', borderRadius: 16, width: '48%', paddingVertical: 15, alignItems: 'center', elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3 }}>
                            <View style={{ backgroundColor: '#fff', borderRadius: 30, width: 55, height: 55, justifyContent: 'center', alignItems: 'center', marginBottom: 8 }}>
                                <MaterialCommunityIcons name="emoticon-sad-outline" size={40} color="#000" />
                            </View>
                            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#000' }}>Something off</Text>
                        </TouchableOpacity>
                    </View>

                    {/* --- Digestive & Excretory Section --- */}
                    <View style={{ backgroundColor: theme.cardBg, borderRadius: 16, padding: 15, marginBottom: 20, borderWidth: 1, borderColor: theme.borderColor }}>
                        <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 15, color: theme.textDark }}>Digestive & Excretory</Text>

                        {/* Vomit Checkbox */}
                        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }} onPress={() => setIsVomitChecked(!isVomitChecked)}>
                            <MaterialCommunityIcons name={isVomitChecked ? "checkbox-marked" : "checkbox-blank-outline"} size={24} color={isVomitChecked ? "#333" : "#999"} />
                            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#333', marginLeft: 10 }}>Vomit</Text>
                        </TouchableOpacity>

                        <Text style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>Color Chart :</Text>

                        {/* Vomit Options */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 25 }}>
                            {[{ label: 'Undigested Food', value: 'undigested_food' }, { label: 'Hairball', value: 'hairball' }, { label: 'White Foam', value: 'white_foam' }, { label: 'Blood', value: 'blood' }, { label: 'Yellow', value: 'yellow' }
                            ].map((item) => {
                                const isActive = isVomitChecked && vomitColor === item.value;
                                return (
                                    <TouchableOpacity
                                        key={item.value}
                                        style={{ alignItems: 'center', flex: 1 }}
                                        onPress={() => isVomitChecked && setVomitColor(vomitColor === item.value ? null : item.value)}
                                        disabled={!isVomitChecked}
                                    >
                                        <View style={[
                                            { width: 60, height: 60, justifyContent: 'center', alignItems: 'center', borderRadius: 16 },
                                            isActive ? {} : {}
                                        ]}>
                                            <Image source={require('../../assets/Urine.png')} style={{ width: 50, height: 50, opacity: isActive ? 1 : 0.45 }} resizeMode="contain" />
                                        </View>
                                        <Text style={{ fontSize: 10, marginTop: 8, color: isVomitChecked ? (isActive ? '#333' : '#8E9E9B') : '#ccc', fontWeight: isActive ? 'bold' : '500', textAlign: 'center' }}>{item.label}</Text>
                                    </TouchableOpacity>
                                )
                            })}
                        </View>

                        <View style={{ height: 1, backgroundColor: theme.borderColor, marginBottom: 20 }} />

                        {/* Diarrhea Checkbox */}
                        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }} onPress={() => setIsDiarrheaChecked(!isDiarrheaChecked)}>
                            <MaterialCommunityIcons name={isDiarrheaChecked ? "checkbox-marked" : "checkbox-blank-outline"} size={24} color={isDiarrheaChecked ? "#333" : "#999"} />
                            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#333', marginLeft: 10 }}>Diarrhea</Text>
                        </TouchableOpacity>

                        <Text style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>Color Chart :</Text>

                        {/* Diarrhea Options */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            {[{ label: 'Watery', value: 'watery' }, { label: 'Mushy', value: 'mushy' }, { label: 'Mucus', value: 'mucus' }, { label: 'Black', value: 'black' }, { label: 'Fresh Blood', value: 'fresh_blood' }
                            ].map((item) => {
                                const isActive = isDiarrheaChecked && diarrheaColor === item.value;
                                return (
                                    <TouchableOpacity
                                        key={item.value}
                                        style={{ alignItems: 'center', flex: 1 }}
                                        onPress={() => isDiarrheaChecked && setDiarrheaColor(diarrheaColor === item.value ? null : item.value)}
                                        disabled={!isDiarrheaChecked}
                                    >
                                        <View style={[
                                            { width: 60, height: 60, justifyContent: 'center', alignItems: 'center', borderRadius: 16 },
                                            isActive ? {} : {}
                                        ]}>
                                            <Image source={require('../../assets/Stool.png')} style={{ width: 50, height: 50, opacity: isActive ? 1 : 0.35 }} resizeMode="contain" />
                                        </View>
                                        <Text style={{ fontSize: 10, marginTop: 8, color: isDiarrheaChecked ? (isActive ? '#333' : '#8E9E9B') : '#ccc', fontWeight: isActive ? 'bold' : '500', textAlign: 'center' }}>{item.label}</Text>
                                    </TouchableOpacity>
                                )
                            })}
                        </View>
                    </View>

                    {/* --- Behavior & Energy Section --- */}
                    <View style={{ backgroundColor: theme.cardBg, borderRadius: 16, padding: 15, marginBottom: 20, borderWidth: 1, borderColor: theme.borderColor }}>
                        <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 15, color: theme.textDark }}>Behavior & Energy</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                            {['ซึม', 'ซ่อนตัว', 'เลียขนมากเกินไป', 'ร้องผิดปกติ', 'เบื่ออาหาร', 'กินจุผิดปกติ', 'กระวนกระวาย', 'โก่งตัว', 'กินน้ำเยอะผิดปกติ', 'ไม่กินน้ำเลย', 'ไม่กินอาหารเลย', 'ไม่เลียขน', 'ก้าวร้าว'].map(tag => { 
                                const isSelected = behaviorTags.includes(tag); 
                                const isBlockedByOvereat = !isSelected && tag === APPETITE_LOSS_TAG && isOverNormalFood;
                                const isBlockedByPolyphagia = !isSelected && (
                                    (tag === POLYPHAGIA_TAG && behaviorTags.includes(APPETITE_LOSS_TAG)) ||
                                    (tag === APPETITE_LOSS_TAG && behaviorTags.includes(POLYPHAGIA_TAG))
                                );
                                const isDisabled = 
                                    (tag === NO_WATER_TAG && behaviorTags.includes(EXCESS_WATER_TAG)) || 
                                    (tag === EXCESS_WATER_TAG && behaviorTags.includes(NO_WATER_TAG)) || 
                                    (tag === POLYPHAGIA_TAG && behaviorTags.includes(NO_FOOD_TAG)) ||
                                    isBlockedByOvereat ||
                                    isBlockedByPolyphagia; 
                                return ( 
                                    <TouchableOpacity 
                                        key={tag} 
                                        onPress={() => void toggleBehaviorTag(tag)} 
                                        disabled={isDisabled} 
                                        style={{
                                            backgroundColor: isSelected ? '#FFA869' : '#F0F0F0',
                                            paddingVertical: 6,
                                            paddingHorizontal: 12,
                                            borderRadius: 20,
                                            opacity: isDisabled ? 0.45 : 1,
                                        }}
                                    >
                                        <Text style={{ color: isSelected ? '#fff' : '#666', fontSize: 12, fontWeight: isSelected ? 'bold' : 'normal' }}>{tag}</Text>
                                    </TouchableOpacity>
                                )
                            })}
                        </View>

                        <View style={{ height: 1, backgroundColor: theme.borderColor, marginVertical: 20 }} />

                        <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 15, color: theme.textDark }}>Respiratory & Physical Appearance</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                            {['จาม', 'มีน้ำมูก', 'มีขี้ตาเยอะ', 'หายใจหอบ', 'พยายามขย้อน'].map(tag => {
                                const isSelected = respiratoryTags.includes(tag);
                                return (
                                    <TouchableOpacity
                                        key={tag}
                                        onPress={() => handleToggleTag(tag, respiratoryTags, setRespiratoryTags)}
                                        style={{ backgroundColor: isSelected ? '#FFA869' : '#E8E8E8', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20 }}
                                    >
                                        <Text style={{ color: isSelected ? '#fff' : '#666', fontSize: 12, fontWeight: isSelected ? 'bold' : 'normal' }}>{tag}</Text>
                                    </TouchableOpacity>
                                )
                            })}
                        </View>
                    </View>

                    {/* --- Notes Section --- */}
                    <View style={{ backgroundColor: theme.cardBg, borderRadius: 16, padding: 15, marginBottom: 20, borderWidth: 1, borderColor: theme.borderColor }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }}>
                            <MaterialCommunityIcons name="note-text-outline" size={20} color={theme.textDark} />
                            <Text style={{ fontSize: 16, fontWeight: 'bold', color: theme.textDark, marginLeft: 8 }}>Notes</Text>
                        </View>
                        <TextInput
                            style={{ backgroundColor: '#F9F9F9', borderRadius: 8, padding: 12, minHeight: 80, textAlignVertical: 'top', color: '#333' }}
                            placeholder="Additional notes (e.g., vomit color, last meal)..."
                            placeholderTextColor="#999"
                            multiline={true}
                            value={notes !== null && notes !== undefined ? String(notes) : ""}
                            onChangeText={setNotes}
                        />
                    </View>

                    <TouchableOpacity style={{ backgroundColor: '#FAD231', borderRadius: 12, height: 55, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20 }} onPress={handleSave} disabled={loading}>
                        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#000', marginRight: 8 }}>{loading ? "Saving..." : "Save Event"}</Text>
                        <Ionicons name="checkmark-circle-outline" size={24} color="#000" />
                    </TouchableOpacity>
                </ScrollView>
            </LinearGradient>
        </View >
    );
};

export default function LogDaily(props) {
    const { session, onBack, onNavigate, initialDate } = props;

    const [status, setStatus] = useState('Normal');
    // Initialize from props first — avoids "No cat profile found" race condition
    const [catId, setCatId] = useState(props.catId || null);
    const [catName, setCatName] = useState(props.catName || '');
    const initialWeight = Number(props.catWeightKg ?? props.catWeight);
    const [catWeightKg, setCatWeightKg] = useState(Number.isFinite(initialWeight) && initialWeight > 0 ? initialWeight : 4);
    const [hasCatWeight, setHasCatWeight] = useState(Number.isFinite(initialWeight) && initialWeight > 0);
    const [loading, setLoading] = useState(false);

    // --- Normal State ---
    const [meals, setMeals] = useState([{ id: Date.now().toString(), food_type: null, amount_grams: "" }]);
    const [consumeMeals, setConsumeMeals] = useState(null);
    const [waterIntake, setWaterIntake] = useState(null);
    const [urineLevel, setUrineLevel] = useState(null);
    const [stoolLevel, setStoolLevel] = useState(null);

    // --- Something Off State ---
    const [isVomitChecked, setIsVomitChecked] = useState(false);
    const [vomitColor, setVomitColor] = useState(null);
    const [isDiarrheaChecked, setIsDiarrheaChecked] = useState(false);
    const [diarrheaColor, setDiarrheaColor] = useState(null);
    const [behaviorTags, setBehaviorTags] = useState([]);
    const [respiratoryTags, setRespiratoryTags] = useState([]);
    const [notes, setNotes] = useState(null);
    const [hasSavedNormalData, setHasSavedNormalData] = useState(false); // Track if normal data exists in DB

    useEffect(() => {
        if (props.catId) {
            // Props already have catId — just load existing log data
            setCatId(props.catId);
            setCatName(props.catName || '');
            fetchExistingLog(props.catId);
        } else if (session?.user) {
            // Fallback: fetch from DB if not in props
            fetchCatIdAndLog();
        }
    }, [session, initialDate, props.catId]);

    // ==========================================
    // ✅ NEW: Keep state consistent if tags are loaded from DB
    // ==========================================
    useEffect(() => {
        if (!Array.isArray(behaviorTags)) return;

        if (behaviorTags.includes(NO_WATER_TAG) && behaviorTags.includes(EXCESS_WATER_TAG)) {
            setBehaviorTags((prev) => prev.filter((t) => t !== EXCESS_WATER_TAG));
        }
        if (behaviorTags.includes(NO_FOOD_TAG) && behaviorTags.includes(POLYPHAGIA_TAG)) {
            setBehaviorTags((prev) => prev.filter((t) => t !== POLYPHAGIA_TAG));
        }

        if (behaviorTags.includes(NO_WATER_TAG)) {
            if (waterIntake !== '0') setWaterIntake('0');
        }
        if (behaviorTags.includes(NO_FOOD_TAG)) {
            const totalFood = sumMealGrams(meals);
            const hasAnyFoodInput =
                totalFood > 0 ||
                (Array.isArray(meals) && meals.some((m) => m?.food_type || String(m?.amount_grams || '').trim() !== '')) ||
                (consumeMeals !== null && String(consumeMeals).trim() !== '');
            if (hasAnyFoodInput) {
                setMeals([]);
                setConsumeMeals('0');
            }
        }
    }, [behaviorTags]);

    const getLocalLogDate = () => {
        if (!initialDate) return new Date();
        return new Date(`${initialDate}T00:00:00`);
    };

    const fetchCatIdAndLog = async () => {
        const { data: catData } = await supabase.from('cats').select('id, name, weight').eq('owner_id', session.user.id).single();
        if (catData) {
            setCatId(catData.id);
            setCatName(catData.name || 'your cat');
            const w = Number(catData.weight);
            if (Number.isFinite(w) && w > 0) {
                setCatWeightKg(w);
                setHasCatWeight(true);
            }
            await fetchExistingLog(catData.id);
        }
    };

    const maybeLoadCatWeight = async (id) => {
        if (!id || hasCatWeight) return;
        const { data } = await supabase.from('cats').select('weight').eq('id', id).maybeSingle();
        const w = Number(data?.weight);
        if (Number.isFinite(w) && w > 0) {
            setCatWeightKg(w);
            setHasCatWeight(true);
        }
    };

    const fetchExistingLog = async (catId) => {
        await maybeLoadCatWeight(catId);
        const logDate = getLocalLogDate();
        const logDateStr = `${logDate.getFullYear()}-${String(logDate.getMonth() + 1).padStart(2, '0')}-${String(logDate.getDate()).padStart(2, '0')}`;
        const pickChild = (child) => {
            if (!child) return null;
            if (Array.isArray(child)) return child[0] || null;
            return child;
        };

        const { data: dailyLogRows } = await supabase
            .from('daily_logs')
            .select(`
                id,
                log_type,
                normal_logs (*),
                something_off_logs (*)
            `)
            .eq('cat_id', catId)
            .eq('log_date', logDateStr)
            .order('created_at', { ascending: false })
            .limit(1);
        const dailyLog = Array.isArray(dailyLogRows) ? dailyLogRows[0] : dailyLogRows;

        if (dailyLog) {
            // Fetch Meal Logs
            const { data: mealLogsData } = await supabase
                .from('meal_logs')
                .select('*')
                .eq('daily_log_id', dailyLog.id)
                .order('created_at', { ascending: true });
                
            if (mealLogsData && mealLogsData.length > 0) {
                setMeals(mealLogsData.map((m, index) => ({
                    id: m.id ? String(m.id) : `${Date.now()}-${index}`,
                    food_type: m.food_type,
                    amount_grams: m.amount_grams !== null && m.amount_grams !== undefined ? String(m.amount_grams) : ""
                })));
            }

            const normal = pickChild(dailyLog.normal_logs);
            if (normal) {
                setHasSavedNormalData(true);
                setConsumeMeals(normal.meals_per_day !== null && normal.meals_per_day !== undefined ? String(normal.meals_per_day) : '');
                setWaterIntake(normal.water_ml_per_day !== null && normal.water_ml_per_day !== undefined ? String(normal.water_ml_per_day) : '');

                const levelToNum = (lvl) => {
                    if (lvl === 'very_high') return 5;
                    if (lvl === 'high') return 4;
                    if (lvl === 'normal') return 3;
                    if (lvl === 'low') return 2;
                    if (lvl === 'very_low') return 1;
                    return null;
                };

                setUrineLevel(levelToNum(normal.urine_level));
                setStoolLevel(levelToNum(normal.stool_level));
            }
            const off = pickChild(dailyLog.something_off_logs);
            if (off) {
                setIsVomitChecked(off.has_vomit);
                setVomitColor(off.vomit_type);
                setIsDiarrheaChecked(off.has_diarrhea);
                setDiarrheaColor(off.diarrhea_type);
                setBehaviorTags(off.behavior_energy || []);
                setRespiratoryTags(off.respiratory_physical || []);
                setNotes(off.notes || null);
            }
        }
    };

    const handleSaveNormal = async () => {
        if (!catId) return Alert.alert("Error", "No cat profile found");

        const isNoFoodSelected = Array.isArray(behaviorTags) && behaviorTags.includes(NO_FOOD_TAG);
        const isNoWaterSelected = Array.isArray(behaviorTags) && behaviorTags.includes(NO_WATER_TAG);
        const mealsArray = Array.isArray(meals) ? meals : [];

        const missingFields = [];
        const hasInvalidMeals = !isNoFoodSelected && (mealsArray.length === 0 || mealsArray.some(m => m.food_type === null || m.amount_grams === null || String(m.amount_grams).trim() === ''));
        if (!isNoFoodSelected && hasInvalidMeals) missingFields.push("Food meals data (ประเภทหรือปริมาณ)");
        if (!isNoFoodSelected && (consumeMeals === null || consumeMeals.toString().trim() === '')) missingFields.push("Consume amount");
        if (!isNoWaterSelected && (waterIntake === null || waterIntake.toString().trim() === '')) missingFields.push("Total water quantity");
        if (urineLevel === null) missingFields.push("Urine level");
        if (stoolLevel === null) missingFields.push("Stool level");


        if (missingFields.length > 0) {
            return Alert.alert("ข้อมูลไม่ครบถ้วน", "กรุณากรอกข้อมูลให้ครบทุกช่องก่อนบันทึก\n(Missing: " + missingFields.join(', ') + ")");
        }

        await saveData();
    };

    const handleSaveSomethingOff = async () => {
        if (!catId) return Alert.alert("Error", "No cat profile found");

        const missingFields = [];
        if (isVomitChecked && !vomitColor) missingFields.push("Vomit Color");
        if (isDiarrheaChecked && !diarrheaColor) missingFields.push("Diarrhea Color");

        if (missingFields.length > 0) {
            return Alert.alert("ข้อมูลไม่ครบถ้วน", "กรุณากรอกข้อมูลให้ครบทุกช่องก่อนบันทึก\n(Missing: " + missingFields.join(', ') + ")");
        }

        setLoading(true);

        try {
            const logDate = getLocalLogDate();
            const logDateStr = `${logDate.getFullYear()}-${String(logDate.getMonth() + 1).padStart(2, '0')}-${String(logDate.getDate()).padStart(2, '0')}`;

            // วิ่งไปเช็คใน Supabase ว่า วันนี้ + แมวตัวนี้ มีข้อมูลหน้า Normal หรือยัง?
            const { data: existingData, error: checkError } = await supabase
                .from('daily_logs')
                .select('id, normal_logs(id)')
                .eq('cat_id', catId)
                .eq('log_date', logDateStr)
                .maybeSingle();

            if (checkError) throw checkError;
            // เช็คว่า normal_logs มีข้อมูลอยู่ข้างในไหม (ใน DB)
            const hasNormalInDB = existingData?.normal_logs &&
                (Array.isArray(existingData.normal_logs) ? existingData.normal_logs.length > 0 : Object.keys(existingData.normal_logs).length > 0);

            // เช็คว่าข้อมูลใน State (หน้าจอ) กรอกครบหรือยัง?
            const isNoFoodSelected = Array.isArray(behaviorTags) && behaviorTags.includes(NO_FOOD_TAG);
            const isNoWaterSelected = Array.isArray(behaviorTags) && behaviorTags.includes(NO_WATER_TAG);
            const mealsArray = Array.isArray(meals) ? meals : [];
            const hasInvalidMeals = !isNoFoodSelected && (mealsArray.length === 0 || mealsArray.some(m => m.food_type === null || m.amount_grams === null || String(m.amount_grams).trim() === ''));
            const isNormalCompleteInState = !hasInvalidMeals &&
                (isNoFoodSelected || (consumeMeals !== null && consumeMeals.toString().trim() !== '')) &&
                (isNoWaterSelected || (waterIntake !== null && waterIntake.toString().trim() !== '')) &&
                urineLevel !== null &&
                stoolLevel !== null;

            // เงื่อนไขใหม่: ถ้าใน DB ไม่มี Normal "และ" ในเครื่องก็ยังกรอกไม่ครบ -> บล็อค!
            if (!hasNormalInDB && !isNormalCompleteInState) {
                setLoading(false);
                return Alert.alert(
                    "ไม่สามารถบันทึกได้",
                    "ต้องกรอกข้อมูลหน้า 'Normal' (อาหาร/น้ำ/ขับถ่าย) ของวันนี้ให้ครบถ้วนก่อน ถึงจะสามารถบันทึก Something off ได้"
                );
            }

            // ถ้าเช็คผ่านหมด (มีข้อมูล Normal แล้ว หรือกรอกครบแล้ว) ก็เซฟได้เลย
            await saveData();

        } catch (error) {
            console.error("Check normal data error:", error);
            Alert.alert("Error", "เกิดข้อผิดพลาดในการตรวจสอบข้อมูล");
            setLoading(false);
        }
    };

    const saveData = async () => {
        if (!catId) return Alert.alert("Error", "No cat profile found");

        // ==========================================
        // ✅ NEW: Pre-save sanity check (prevent extreme input mistakes)
        // ==========================================
        const totalFoodGrams = sumMealGrams(meals); 
        const isNoFoodSelected = Array.isArray(behaviorTags) && behaviorTags.includes(NO_FOOD_TAG); 
        const isNoWaterSelected = Array.isArray(behaviorTags) && behaviorTags.includes(NO_WATER_TAG); 
        const currentBehaviorTags = Array.isArray(behaviorTags) ? behaviorTags : [];
        const hasAppetiteLoss = currentBehaviorTags.includes(APPETITE_LOSS_TAG);
        const hasPolyphagia = currentBehaviorTags.includes(POLYPHAGIA_TAG);

        // Prevent contradictory input: overfeeding + appetite loss
        if (!isNoFoodSelected && totalFoodGrams > FOOD_WARNING_G && hasAppetiteLoss) {
            Alert.alert(
                'ข้อมูลขัดแย้งกัน',
                `คุณกรอกปริมาณอาหารรวม ${formatNumber(totalFoodGrams)}g (เกิน ${FOOD_WARNING_G}g)\nโปรดเอา "${APPETITE_LOSS_TAG}" ออกก่อนบันทึก`
            );
            return;
        }

        // Prevent contradictory tags
        if (hasAppetiteLoss && hasPolyphagia) {
            Alert.alert('ข้อมูลขัดแย้งกัน', `ไม่สามารถเลือก "${APPETITE_LOSS_TAG}" พร้อม "${POLYPHAGIA_TAG}" ได้`);
            return;
        }
        if (!isNoFoodSelected && totalFoodGrams >= EXTREME_FOOD_CONFIRM_G) { 
            const ok = await confirmDialog( 
                'ตรวจสอบปริมาณอาหาร', 
                `คุณกรอกปริมาณอาหาร ${formatNumber(totalFoodGrams)}g แน่ใจหรือไม่?\nปริมาณนี้อาจเป็นอันตรายต่อแมว`, 
                'บันทึกต่อ'
            );
            if (!ok) return;
        } else if (!isNoFoodSelected && totalFoodGrams > FOOD_WARNING_G) { 
            const ok = await confirmDialog( 
                'ปริมาณอาหารเกินมาตรฐาน', 
                `ปริมาณอาหารเกินมาตรฐาน (${FOOD_WARNING_G}g)! โปรดตรวจสอบความถูกต้อง หรือเฝ้าระวังภาวะกินจุผิดปกติ\n\nปริมาณที่กรอก: ${formatNumber(totalFoodGrams)}g`, 
                'บันทึกต่อ' 
            ); 
            if (!ok) return; 
        } 

        const waterNow = Number(waterIntake);
        if (!isNoWaterSelected && Number.isFinite(waterNow) && waterNow >= WATER_ALERT_ML) {
            const ok = await confirmDialog(
                'ปริมาณน้ำสูงผิดปกติ',
                `คุณกรอกปริมาณน้ำ ${formatNumber(waterNow)} ml/วัน แน่ใจหรือไม่?\nหากมากผิดปกติอาจเสี่ยงโรคไต/เบาหวาน`,
                'บันทึกต่อ'
            );
            if (!ok) return;
        }
 
        setLoading(true); 
        const logDate = getLocalLogDate();
        const logDateStr = `${logDate.getFullYear()}-${String(logDate.getMonth() + 1).padStart(2, '0')}-${String(logDate.getDate()).padStart(2, '0')}`;

        try {
            // Step 1: UPSERT daily_logs (parent)
            const { data: dailyLog, error: dailyError } = await supabase
                .from('daily_logs')
                .upsert({
                    cat_id: catId,
                    log_date: logDateStr,
                    log_type: (isVomitChecked || isDiarrheaChecked || behaviorTags.length > 0 || respiratoryTags.length > 0) ? 'something_off' : 'normal'
                }, { onConflict: 'cat_id, log_date' })
                .select('id')
                .single();

            if (dailyError) throw dailyError;

            // Step 2: Save Normal Logs if complete
            const mealsArrayState = Array.isArray(meals) ? meals : [];
            const hasInvalidMeals = !isNoFoodSelected && (mealsArrayState.length === 0 || mealsArrayState.some(m => m.food_type === null || m.amount_grams === null || String(m.amount_grams).trim() === ''));
            const isNormalComplete = !hasInvalidMeals &&
                (isNoFoodSelected || (consumeMeals !== null && consumeMeals.toString().trim() !== '')) &&
                (isNoWaterSelected || (waterIntake !== null && waterIntake.toString().trim() !== '')) &&
                urineLevel !== null &&
                stoolLevel !== null;

            if (isNormalComplete) {
                const { error: normalError } = await supabase
                    .from('normal_logs')
                    .upsert({
                        daily_log_id: dailyLog.id,
                        meals_per_day: isNoFoodSelected ? 0 : (consumeMeals !== null && consumeMeals !== '' ? Number(consumeMeals) : 0),
                        water_ml_per_day: isNoWaterSelected ? 0 : (waterIntake !== null && waterIntake !== '' ? Number(waterIntake) : 0),
                        urine_level: getLevelValue(urineLevel),
                        stool_level: getLevelValue(stoolLevel),
                    }, { onConflict: 'daily_log_id' });

                if (normalError) throw normalError;
                
                // Save meals array
                // First delete existing meals for this daily_log_id
                await supabase.from('meal_logs').delete().eq('daily_log_id', dailyLog.id);

                // Then insert the new items (skip if user selected "no food")
                if (!isNoFoodSelected) {
                    const mealsArray = mealsArrayState.map(m => ({
                        daily_log_id: dailyLog.id,
                        food_type: m.food_type,
                        amount_grams: m.amount_grams !== null && m.amount_grams !== '' ? Number(m.amount_grams) : 0
                    }));

                    const { error: mealsError } = await supabase.from('meal_logs').insert(mealsArray);
                    if (mealsError) throw mealsError;
                }
            }

            // Step 3: Save Something Off Logs if we are in 'Something off' mode or have data
            const isSomethingOffActive = (status === 'Something off') ||
                isVomitChecked || isDiarrheaChecked ||
                behaviorTags.length > 0 || respiratoryTags.length > 0 ||
                (notes && notes.trim() !== '');

            if (isSomethingOffActive) {
                const { error: offError } = await supabase
                    .from('something_off_logs')
                    .upsert({
                        daily_log_id: dailyLog.id,
                        has_vomit: isVomitChecked,
                        vomit_type: isVomitChecked ? formatToEnum(vomitColor) : null,
                        has_diarrhea: isDiarrheaChecked,
                        diarrhea_type: isDiarrheaChecked ? formatToEnum(diarrheaColor) : null,
                        behavior_energy: behaviorTags.length > 0 ? behaviorTags : null,
                        respiratory_physical: respiratoryTags.length > 0 ? respiratoryTags : null,
                        notes: notes || null,
                    }, { onConflict: 'daily_log_id' });

                if (offError) throw offError;
            }

            try {
                await AlertEngine.logEvent({
                    type: 'daily_log_saved',
                    severity: 'success',
                    title: 'Daily Log Saved',
                    desc: `Saved daily log for ${catName || 'your cat'} (${logDateStr}).`,
                    details: status === 'Something off' ? 'Includes something-off symptoms.' : 'Normal daily status recorded.',
                    dedupeKey: `daily_log_saved:${catId}:${logDateStr}`,
                    cooldownMs: 2 * 60 * 1000,
                });
            } catch (_) {
                // keep daily save success path unchanged
            }

            Alert.alert('Success', 'Saved Event!', [{
                text: 'OK',
                onPress: () => {
                    // ไปหน้า Calendar ที่วันที่บันทึก
                    if (onNavigate) {
                        onNavigate('Calendar', { date: logDateStr });
                    } else if (onBack) {
                        onBack();
                    }
                }
            }]);
        } catch (err) {
            console.error('Save error:', err);
            Alert.alert('Error', err.message);
        } finally {
            setLoading(false);
        }
    };

    const state = {
        meals, consumeMeals, waterIntake, urineLevel, stoolLevel,
        isVomitChecked, vomitColor, isDiarrheaChecked, diarrheaColor, behaviorTags, respiratoryTags, notes,
        catName,
        catWeightKg,
    };

    const setters = {
        setMeals, setConsumeMeals, setWaterIntake, setUrineLevel, setStoolLevel,
        setIsVomitChecked, setVomitColor, setIsDiarrheaChecked, setDiarrheaColor, setBehaviorTags, setRespiratoryTags, setNotes
    };

    return status === 'Normal' ? (
        <NormalView props={props} setStatus={setStatus} state={state} setters={setters} handleSave={handleSaveNormal} loading={loading} />
    ) : (
        <SomethingOffView props={props} setStatus={setStatus} state={state} setters={setters} handleSave={handleSaveSomethingOff} loading={loading} />
    );
}
