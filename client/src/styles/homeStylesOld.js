import { StyleSheet, Dimensions } from "react-native";

const styles = StyleSheet.create({
  /* ====== หน้า HOME ====== */
  container: {
    flex: 1,
    backgroundColor: "#B2E1DB", // พื้นหลังหน้า HOME
  },

  /* ====== HEADER ====== */
  headerBg: {
    height: 77,
    width: "100%",
    backgroundColor: "rgba(225, 246, 243, 0.45)", // B0DDD7 45%
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },

  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#677684", // Nekocare
  },

  iconGroup: {
    flexDirection: "row",
    gap: 12,
  },

  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },

  /* ====== PROFILE SECTION ====== */
  profileSection: {
    alignItems: "center",
    marginTop: 20,
  },

  profileOuter: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "#329A61",
    justifyContent: "center",
    alignItems: "center",
  },

  profileInner: {
    width: 171.43,
    height: 171.43,
    borderRadius: 85.715,
    resizeMode: "cover",
  },

  /* ====== TEXT SECTION ====== */
  textSection: {
    alignItems: "center",
    marginTop: 24,
    paddingHorizontal: 24,
  },

  welcomeTitle: {
    fontFamily: "Inter-Bold",
    fontSize: 26,
    color: "#000000",
    textAlign: "center",
  },

  welcomeDesc: {
    marginTop: 8,
    fontFamily: "Inter-Light",
    fontSize: 14,
    color: "#000000",
    textAlign: "center",
    lineHeight: 20,
  },

  statusText: {
    marginTop: 8,
    fontFamily: "Inter-Medium",
    fontSize: 12,
    color: "#B4B4B4",
  },

  /* ====== ASSESS BUTTON ====== */
  assessButton: {
    width: '100%',
    height: 60,
    backgroundColor: "rgba(63, 168, 164, 0.8)", // #3FA8A4 80% transparent
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
    shadowColor: "#3FA8A4",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },

  assessButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    marginLeft: 10,
    letterSpacing: 0.5,
  },

  /* ====== PHOTO CARD ====== */
  photoCard: {
    width: '100%',
    minHeight: 90,
    backgroundColor: "rgba(154, 208, 206, 0.7)", // #9AD0CE at 70% opacity
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "rgba(79, 209, 197, 0.3)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  photoLeft: {
    flex: 1,
    paddingRight: 10,
  },

  photoTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2C7A7B", // Dark Teal
    marginBottom: 0,
    lineHeight: 20,
  },

  photoDesc: {
    fontSize: 12,
    color: "#4A5568",
    lineHeight: 16,
  },

  photoBtn: {
    backgroundColor: "#319795",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    shadowColor: "#319795",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },

  photoBtnText: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#FFF",
  },
  /* ===== HORIZONTAL INFO CARDS (Obsolete) ===== */
  /* Remove entire infoScroll/infoCard section */

  /* ====== HOMESCREENNEW SPECIFIC STYLES ====== */
  /* ====== HERO SECTION (Circle Cat) ====== */
  heroSection: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },

  circleCatContainer: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5,
    position: 'relative',
  },

  circleCat: {
    width: 156,
    height: 156,
    borderRadius: 78,
    borderWidth: 4,
    borderColor: '#FFF',
  },

  loveIcon: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: '#E0E0E0',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFF',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },

  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2D3748', // Darker elegant text
    textAlign: 'center',
    width: 250,
    lineHeight: 30,
  },

  heroSubtitle: {
    fontSize: 14,
    color: "#4A5568",
    textAlign: "center",
    marginBottom: 4,
  },

  lastCheckText: {
    fontSize: 13,
    color: '#A0AEC0',
    marginLeft: 4,
  },

  /* ====== ACTION BUTTONS ====== */
  actionContainer: {
    width: '100%',
    paddingHorizontal: 20, // Match CameraScreen's scrollContent padding
    paddingBottom: 20,
    marginTop: 10,
  },

  /* ====== 3. GETTING STARTED TIMELINE ====== */
  gettingStartedSection: {
    width: '100%',
    paddingHorizontal: 15,
    marginBottom: 20,
    marginTop: 10,
  },
  gettingStartedTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2C7A7B", // Match theme teal
    marginBottom: 15,
  },
  timelineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 25,
    position: 'relative',
  },
  timelineCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#A7D7C5", // Active green
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
    zIndex: 2,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  timelineEmpty: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#E2F0EA", // Inactive pale green
    marginRight: 15,
    zIndex: 2,
  },
  timelineLine: {
    position: 'absolute',
    left: 12, // center of circle
    top: 26, // bottom of circle
    bottom: -25, // extends to the next item
    width: 2, // Width of line
    backgroundColor: "#E2F0EA",
    zIndex: 1,
  },
  timelineText: {
    fontSize: 13,
    color: "#2C7A7B",
    fontWeight: "600",
  },

  /* ====== 4. SMART MONITORING CARD ====== */
  smartMonitoringCard: {
    width: '100%',
    backgroundColor: "#B2DFDB", // Soft teal background
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 30, // Bottom padding for scroll
    marginHorizontal: 15,
    width: Dimensions.get('window').width - 30, // Dynamic width keeping margins
  },
  smartMonLeft: {
    flex: 1,
    paddingRight: 10,
  },
  smartMonTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2C7A7B",
    marginBottom: 6,
  },
  smartMonDesc: {
    fontSize: 11,
    color: "#4A5568",
    lineHeight: 16,
  },
  smartMonBtn: {
    backgroundColor: "#8CCBB6", // Button color
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  smartMonBtnText: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#FFF",
  }
});

export default styles;
