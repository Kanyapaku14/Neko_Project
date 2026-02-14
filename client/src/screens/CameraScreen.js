import { View, Text, SafeAreaView } from "react-native";
import BottomNav from "../components/BottomNav";

export default function CameraScreen({ onNavigate }) {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>Camera Screen</Text>
      </View>
      <BottomNav current="Camera" onNavigate={onNavigate} />
    </SafeAreaView>
  );
}
