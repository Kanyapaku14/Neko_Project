import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
// ลบบรรทัด useFocusEffect ออกไปแล้วครับ
import BottomNav from "../components/BottomNav";
import supabase from "./config/supabaseClient";

const { width } = Dimensions.get("window");

const DAYS_OF_WEEK = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function CalendarScreen({ onNavigate, session }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dailyLog, setDailyLog] = useState(null);
  const [loading, setLoading] = useState(false);
  const [catId, setCatId] = useState(null);

  // Fetch Cat ID first
  useEffect(() => {
    const fetchCat = async () => {
      if (!session?.user?.id) return;
      const { data, error } = await supabase
        .from('cats')
        .select('id')
        .eq('owner_id', session.user.id)
        .limit(1)
        .single();

      if (data) setCatId(data.id);
    };
    fetchCat();
  }, [session]);

  // กลับมาใช้ useEffect ธรรมดาแบบเดิม
  useEffect(() => {
    const fetchLog = async () => {
      if (!catId || !selectedDate) return;
      setLoading(true);
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;

      const { data, error } = await supabase
        .from('daily_logs')
        .select('*, normal_logs(*), something_off_logs(*)')
        .eq('cat_id', catId)
        .eq('log_date', dateString)
        .maybeSingle();
      if (error) console.error("Error fetching calendar log:", error);
      setDailyLog(data || null);
      setLoading(false);
    };

    fetchLog();
  }, [selectedDate, catId]);

  // Helper to change month
  const changeMonth = (direction) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(currentDate.getMonth() + direction);
    setCurrentDate(newDate);
  };

  // Helper to get days in month
  const getDaysInMonth = (year, month) => {
    return new Date(year, month + 1, 0).getDate();
  };

  // Helper to get first day of week
  const getFirstDayOfMonth = (year, month) => {
    return new Date(year, month, 1).getDay();
  };

  const renderCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);

    const days = [];

    // Empty slots for previous month
    for (let i = 0; i < firstDay; i++) {
      days.push(<View key={`empty-${i}`} style={styles.dayCell} />);
    }

    // Days of current month
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const isSelected = selectedDate.getDate() === d &&
        selectedDate.getMonth() === month &&
        selectedDate.getFullYear() === year;

      days.push(
        <TouchableOpacity
          key={`day-${d}`}
          style={[styles.dayCell, isSelected && styles.selectedDay]}
          onPress={() => setSelectedDate(date)}
        >
          <Text style={[styles.dayText, isSelected && styles.selectedDayText]}>{d}</Text>
        </TouchableOpacity>
      );
    }

    return days;
  };

  return (
    <View style={styles.container}>
      {/* Calendar Card */}
      <View style={styles.calendarCard}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => changeMonth(-1)}>
            <Feather name="chevron-left" size={24} color="#147C78" />
          </TouchableOpacity>
          <Text style={styles.monthTitle}>
            {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
          </Text>
          <TouchableOpacity onPress={() => changeMonth(1)}>
            <Feather name="chevron-right" size={24} color="#147C78" />
          </TouchableOpacity>
        </View>

        {/* Days Header */}
        <View style={styles.weekHeader}>
          {DAYS_OF_WEEK.map((day, index) => (
            <Text key={index} style={styles.weekDayText}>{day}</Text>
          ))}
        </View>

        {/* Calendar Grid */}
        <View style={styles.calendarGrid}>
          {renderCalendar()}
        </View>
      </View>

      {/* Details Section */}
      <ScrollView
        style={styles.detailsContainer}
        contentContainerStyle={{ paddingBottom: 150 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Selected Date Header */}
        <View style={styles.detailsHeader}>
          <Text style={styles.dateTitle}>
            {DAYS_OF_WEEK[selectedDate.getDay()]}, {MONTHS[selectedDate.getMonth()].substring(0, 3)} {selectedDate.getDate()}
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator size="small" color="#147C78" style={{ marginTop: 20 }} />
        ) : dailyLog ? (
          <View>
            {/* Summary Card (Food & Water) */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>FOOD</Text>
                <Text style={styles.summaryValue}>
                  {dailyLog.normal_logs?.[0]?.total_food_grams ?? dailyLog.normal_logs?.total_food_grams ?? '-'} g
                </Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>WATER</Text>
                <Text style={styles.summaryValue}>
                  {dailyLog.normal_logs?.[0]?.water_ml_per_day ?? dailyLog.normal_logs?.water_ml_per_day ?? '-'} ml
                </Text>
              </View>
            </View>

            {/* Detailed List */}
            <View style={styles.textLogContainer}>
              <View style={styles.textLogRow}>
                <MaterialCommunityIcons name="water-percent" size={18} color="#147C78" />
                <Text style={styles.textLogLabel}>Urine: </Text>
                <Text style={styles.textLogValue}>
                  {dailyLog.normal_logs?.[0]?.urine_level?.replace(/_/g, ' ') ?? dailyLog.normal_logs?.urine_level?.replace(/_/g, ' ') ?? '-'}
                </Text>
              </View>

              <View style={styles.textLogRow}>

                <MaterialCommunityIcons name="emoticon-poop" size={18} color="#147C78" />
                <Text style={styles.textLogLabel}>Stool: </Text>
                <Text style={styles.textLogValue}>
                  {dailyLog.normal_logs?.[0]?.stool_level?.replace(/_/g, ' ') ?? dailyLog.normal_logs?.stool_level?.replace(/_/g, ' ') ?? '-'}
                </Text>
              </View>

              {/* something_off_logs section */}
              {(dailyLog.something_off_logs?.[0] || dailyLog.something_off_logs) && (
                <>
                  <View style={{ height: 1.5, backgroundColor: 'rgba(20, 124, 120, 0.2)', marginVertical: 10 }} />

                  {(() => {
                    const offLog = Array.isArray(dailyLog.something_off_logs) ? dailyLog.something_off_logs[0] : dailyLog.something_off_logs;
                    return (
                      <>
                        {offLog?.has_vomit && (
                          <View style={styles.textLogRow}>
                            <MaterialCommunityIcons name="alert-circle" size={18} color="#D32F2F" />
                            <Text style={[styles.textLogLabel, { color: '#D32F2F' }]}>Vomit: </Text>
                            <Text style={[styles.textLogValue, { color: '#D32F2F' }]}>
                              {offLog.vomit_type?.replace(/_/g, ' ') || 'Yes'}
                            </Text>
                          </View>
                        )}

                        {offLog?.has_diarrhea && (
                          <View style={styles.textLogRow}>
                            <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#D32F2F" />
                            <Text style={[styles.textLogLabel, { color: '#D32F2F' }]}>Diarrhea: </Text>
                            <Text style={[styles.textLogValue, { color: '#D32F2F' }]}>
                              {offLog.diarrhea_type?.replace(/_/g, ' ') || 'Yes'}
                            </Text>
                          </View>
                        )}

                        {offLog?.behavior_energy && (
                          <View style={styles.textLogRow}>
                            <MaterialCommunityIcons name="cat" size={18} color="#147C78" />
                            <Text style={styles.textLogLabel}>Behavior: </Text>
                            <Text style={[styles.textLogValue, { flex: 1 }]}>
                              {Array.isArray(offLog.behavior_energy)
                                ? offLog.behavior_energy.join(', ')
                                : offLog.behavior_energy}
                            </Text>
                          </View>
                        )}

                        {offLog?.notes && (
                          <View style={[styles.textLogRow, { alignItems: 'flex-start' }]}>
                            <MaterialCommunityIcons name="note-text" size={18} color="#147C78" />
                            <Text style={styles.textLogLabel}>Notes: </Text>
                            <Text style={[styles.textLogValue, { flex: 1 }]}>{offLog.notes}</Text>
                          </View>
                        )}
                      </>
                    );
                  })()}
                </>
              )}
            </View>

            {/* Edit Recorded Log Button */}
            <TouchableOpacity
              style={[styles.editButton, { marginTop: 0, marginBottom: 10 }]}
              onPress={() => {
                const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
                onNavigate({
                  screen: 'LogDaily',
                  initialDate: dateStr,
                  params: { date: dateStr }
                });
              }}
            >
              <Feather name="edit-2" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.editButtonText}>
                Edit Log for {selectedDate.getDate()}/{selectedDate.getMonth() + 1}
              </Text>
            </TouchableOpacity>

            {/* Add Medical Log Button (กรณีมีข้อมูลเดิม) */}
            <TouchableOpacity
              style={[styles.editButton, { marginTop: 10, backgroundColor: "#147C78", marginBottom: 20 }]}
              onPress={() => {
                const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
                onNavigate({ screen: 'AddMedical', params: { initialDate: dateStr } });
              }}
            >
              <MaterialCommunityIcons name="medical-bag" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.editButtonText}>Add Medical Log</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <Text style={styles.noRecordText}>There is no record for this day.</Text>

            <Text style={styles.photosLabel}>Photos</Text>
            <TouchableOpacity style={styles.photoPlaceholder}>
              <Ionicons name="camera" size={32} color="#147C78" />
            </TouchableOpacity>

            {/* Add Log Button (กรณีไม่มีข้อมูล) */}
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => {
                const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
                onNavigate({
                  screen: 'LogDaily',
                  initialDate: dateStr,
                  params: { date: dateStr }
                });
              }}
            >
              <Feather name="plus-circle" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.editButtonText}>
                Add Log for {selectedDate.getDate()}/{selectedDate.getMonth() + 1}
              </Text>
            </TouchableOpacity>

            {/* Add Medical Log Button (กรณีไม่มีข้อมูล) */}
            <TouchableOpacity
              style={[styles.editButton, { marginTop: 10, backgroundColor: "#147C78", marginBottom: 20 }]}
              onPress={() => {
                const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
                onNavigate({ screen: 'AddMedical', params: { initialDate: dateStr } });
              }}
            >
              <MaterialCommunityIcons name="medical-bag" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.editButtonText}>Add Medical Log</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <BottomNav current="Calendar" onNavigate={onNavigate} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#B2E1DB",
    alignItems: "center",
  },
  calendarCard: {
    marginTop: 60,
    width: width * 0.9,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    paddingBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 2,
    borderColor: "#8A2BE2",
    zIndex: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  monthTitle: {
    fontSize: 20,
    fontFamily: "Poppins-SemiBold",
    color: "#147C78",
    fontWeight: "600",
  },
  weekHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  weekDayText: {
    flex: 1,
    textAlign: "center",
    fontSize: 10,
    color: "#147C78",
    fontWeight: "600",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  dayText: {
    fontSize: 14,
    color: "#147C78",
    fontFamily: "Poppins-Regular",
  },
  selectedDay: {
    borderBottomWidth: 2,
    borderColor: "#1FB3A8",
  },
  selectedDayText: {
    color: "#147C78",
    fontWeight: "bold",
  },
  indicator: {
    width: 6,
    height: 2,
    backgroundColor: "#1FB3A8",
    marginTop: 2,
  },
  detailsContainer: {
    flex: 1,
    width: "100%",
    backgroundColor: "#B2E1DB",
    marginTop: -20,
    paddingTop: 40,
    paddingHorizontal: 24,
  },
  detailsHeader: {
    marginBottom: 16,
  },
  dateTitle: {
    fontSize: 24,
    color: "#147C78",
    fontWeight: "bold",
  },
  noRecordText: {
    fontSize: 14,
    color: "#8FA3A0",
    marginBottom: 24,
  },
  statsRow: {
    flexDirection: "row",
    marginBottom: 30,
    justifyContent: 'flex-start',
  },
  statItem: {
    marginRight: 60,
  },
  statLabel: {
    fontSize: 14,
    color: "#147C78",
    fontWeight: "bold",
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  divider: {
    width: 2,
    height: "100%",
    backgroundColor: "#147C78",
    marginRight: 60,
    opacity: 0.3,
  },
  textLogContainer: {
    backgroundColor: "rgba(255,255,255,0.4)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  textLogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  textLogLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#147C78',
    marginLeft: 8,
  },
  textLogValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  photosLabel: {
    fontSize: 16,
    color: "#147C78",
    fontWeight: "bold",
    marginBottom: 12,
  },
  photoPlaceholder: {
    width: "100%",
    height: 140,
    backgroundColor: "#9ACBC7",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#88BDB9",
    borderStyle: "dashed",
    marginBottom: 20,
  },
  editButton: {
    backgroundColor: "#3FA8A4",
    paddingVertical: 16,
    width: "100%",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginTop: "auto",
    marginBottom: 110,
  },
  editButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: 18,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 10,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#147C78',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'flex-start',
    paddingLeft: 10,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#147C78',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  summaryDivider: {
    width: 1,
    height: '80%',
    backgroundColor: '#147C78',
    opacity: 0.5,
    marginHorizontal: 5,
  },
});