# 🐾 Neko Project - Cat Health & Behavior App

![React Native](https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Expo](https://img.shields.io/badge/Expo-000020?style=for-the-badge&logo=expo&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-181818?style=for-the-badge&logo=supabase&logoColor=3ECF8E)

A comprehensive mobile application designed to track, manage, and monitor your beloved cat's health. Built with React Native and Expo, Neko Project seamlessly integrates with an AI-powered smart camera to provide 24/7 behavioral monitoring and real-time alerts.

---

## ✨ Key Features & Capabilities

### 1. 🤖 AI Smart Camera Integration
- **24/7 Monitoring:** Connects seamlessly to external smart camera hardware via our custom backend.
- **Behavior Detection:** Utilizes deep learning to detect abnormal behaviors (e.g., head pressing, vomiting, limping).
- **Real-Time Alerts:** Push notifications immediately inform you of critical events and camera connectivity status.

### 2. 📊 Health Tracking & Dashboard
- **Daily Logging:** Track daily habits, food/water intake, and litter box usage.
- **Medical Records:** Centralize vaccinations, vet visits, and medication schedules.
- **Analytics Dashboard:** Visualize health trends over time with interactive charts.

### 3. 📅 Calendar & Timeline
- **Event Scheduling:** Never miss a vet appointment, vaccination booster, or grooming session.
- **Life Timeline:** A historical view of your cat's significant health milestones and daily activities.

### 4. 🌍 Cat Community
- **Social Networking:** Connect, share, and interact with fellow cat owners.
- **Knowledge Sharing:** Exchange tips and view community-driven rankings and profiles.

---

## 🛠 Tech Stack

- **Frontend:** React Native, Expo
- **Backend & Auth:** Supabase
- **Local Storage:** SQLite (`expo-sqlite`), AsyncStorage
- **UI & Styling:** `@rneui/themed`, React Native Reanimated
- **Animations:** Lottie (`lottie-react-native`)
- **Data Visualization:** `react-native-chart-kit`
- **Hardware Integrations:** `expo-notifications`, `expo-av` (Audio/Video), `expo-image-picker`

---

## 🚀 Getting Started

Follow these instructions to set up the project locally for development and testing.

### Prerequisites
Make sure you have the following installed:
- [Node.js](https://nodejs.org/) (v16.x or newer)
- npm, yarn, or bun
- [Expo Go](https://expo.dev/client) app installed on your physical device, OR an iOS Simulator / Android Emulator.

### Environment Setup
1. Clone the repository and navigate to the `client` directory.
2. Create a `.env` file in the root of the `client` directory:
   ```bash
   cp .env.example .env
   
1. Populate the .env file with your Supabase and API credentials:
  EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
  EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
  EXPO_PUBLIC_AI_API_URL=your_ai_backend_endpoint

Installation
Install the required dependencies:
npm install
or
yarn install

Running the App
Start the Expo development server:
npx expo start
- Press a to open on Android Emulator.
- Press i to open on iOS Simulator.
- Scan the QR Code with the Expo Go app to test on a physical device.

#📁 Project Structure
A modular architecture for scalability and maintainability:
client/
├── assets/                 # Static assets (images, fonts, Lottie JSONs)
├── src/                    # Main application code
│   ├── components/         # Reusable UI components (Buttons, Cards, Modals)
│   ├── screens/            # Screen components grouped by features
│   ├── navigation/         # React Navigation setup and route definitions
│   ├── services/           # API clients, Supabase config, and AI integrations
│   ├── store/              # State management (Context API / Redux / Zustand)
│   ├── utils/              # Helper functions, constants, and theme configs
│   └── hooks/              # Custom React hooks
├── App.js                  # Application entry point
├── app.json                # Expo configuration file
└── babel.config.js         # Babel compiler configuration

#🤝 Contributing
We welcome contributions! If you'd like to improve the app:
1.Fork the repository.
2.Create a new feature branch (git checkout -b feature/AmazingFeature).
3.Commit your changes (git commit -m 'Add some AmazingFeature').
4.Push to the branch (git push origin feature/AmazingFeature).
5.Open a Pull Request.

#📄 License
This project is licensed under the MIT License - see the LICENSE file for details.
