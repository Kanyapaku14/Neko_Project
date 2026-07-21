# Neko Project - Cat Health App (Client) 🐱

A mobile application for tracking and managing your beloved cat's health, built with React Native and Expo.

## ✨ Key Features & Capabilities

The Neko Project offers a comprehensive suite of features designed to make cat care easier and more interactive:

1. **AI Smart Camera Integration (Hardware Connection)**
   - Connects to an external smart camera device (hardware) to monitor your cat 24/7.
   - Uses AI algorithms to detect abnormal behavior and identify individual cats.
   - Pushes real-time alerts to the app regarding your cat's activities or camera connection status.

2. **Health Tracking & Dashboard**
   - **Daily Logging:** Log your cat's daily habits, food intake, and litter box usage.
   - **Medical Records:** Keep track of vaccinations, medical check-ups, and health assessments.
   - **Data Visualization:** View health statistics, trends, and analytical results through an interactive dashboard.

3. **Calendar & Timeline**
   - Schedule upcoming events such as vet appointments, vaccinations, and grooming.
   - View a historical timeline of your cat's activities and health milestones.

4. **Cat Community**
   - Connect with other cat owners in the community.
   - Share posts, photos, and updates about your feline friends.
   - View community rankings and user profiles.

## 🌟 Highlights

- **Real-time Monitoring:** The seamless integration between the mobile app and the smart camera hardware ensures you are instantly notified of any abnormal behaviors.
- **All-in-one Management:** Combines health tracking, medical records, and social networking in a single intuitive application.
- **Delightful UI/UX:** Built with Reanimated and Lottie for smooth animations and a premium user experience.

## 🛠 Tech Stack
- **Framework:** React Native, Expo
- **Backend/Database:** Supabase
- **Local Storage:** SQLite (`expo-sqlite`), AsyncStorage
- **UI & Animations:** `@rneui/themed`, Lottie (`lottie-react-native`), Reanimated
- **Data Visualization:** `react-native-chart-kit`
- **Device Features:** Notifications (`expo-notifications`), Image Picker, Audio/Video (`expo-av`)

## 🚀 Installation & Setup

1. **Install Dependencies:**
   Navigate to the `client` folder and run:
   ```bash
   npm install
   ```

2. **Run the Project:**
   ```bash
   npm start
   # or run using Expo CLI
   npx expo start
   ```

3. **Platform-specific commands:**
   - Run on Android: `npm run android`
   - Run on iOS: `npm run ios`
   - Run on Web: `npm run web`

## 📁 Project Structure
- `src/`: Main source code directory (Components, Screens, Services, Navigation, etc.)
- `assets/`: Image files, fonts, and other media
- `App.js`: Application entry point
