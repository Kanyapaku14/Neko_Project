import { StyleSheet } from "react-native";

const styles = StyleSheet.create({
  /* ====== หน้า HOME ====== */
  container: {
    flex: 1,
    backgroundColor: "#f5fffdff", // Match CameraScreen strictly
  },

  /* ====== HEADER ====== */
  headerBg: {
    height: 75,
    width: "100%",
    backgroundColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16, // Matching CameraScreen header padding
    paddingTop: 10,
    paddingBottom: 5,
  },

  catDropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
  },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#4FD1C5',
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },

  titleContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 10, // Match headerBg padding
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    zIndex: 0,
  },

  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#4A5568", // Dark Gray
    letterSpacing: 1,
  },

  iconGroup: {
    flexDirection: "row",
    gap: 15,
  },

  iconBtn: {
    padding: 5,
  },

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
    backgroundColor: 'rgba(79, 209, 197, 0.2)', // Lighter mint green
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
    backgroundColor: '#4AA99C',
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
    fontSize: 13, // Reduced size further based on user request
    fontWeight: "700",
    color: "#2C7A7B", // Dark Teal
    marginBottom: 0, // Remove margin as the parent view has marginBottom: 5
    lineHeight: 20, // Match the icon's visual height for perfect alignment
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

  /* ====== LOG DAILY CARD ====== */
  logCard: {
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
  logLeft: {
    flex: 1,
    paddingRight: 10,
  },
  logTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2C7A7B", // Dark Teal
    marginBottom: 0,
    lineHeight: 20,
  },
  logDesc: {
    fontSize: 12,
    color: "#4A5568",
    lineHeight: 16,
  },
  logBtn: {
    backgroundColor: "#319795", // Teal primary
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    shadowColor: "#319795",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  logBtnText: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#FFF",
  },

  /* ====== BANNER CAROUSEL SECTION ====== */
  bannerSectionContainer: {
    width: '100%',
    marginTop: 10,
    marginBottom: 20,
    alignItems: 'center',
  },
  bannerScrollContent: {
    paddingHorizontal: 20,
  },
  bannerCard: {
    width: 330,
    height: 140,
    borderRadius: 16,
    marginRight: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
    backgroundColor: '#fff',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  paginationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#CBD5E0',
    marginHorizontal: 4,
  },
  paginationDotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1A202C',
  },
  bannerGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '60%',
    justifyContent: 'flex-end',
    padding: 12,
  },
  bannerTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  }

});

export default styles;
