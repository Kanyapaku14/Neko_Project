import { registerRootComponent } from 'expo';
import { SafeAreaView } from 'react-native';

import App from './App';

const RootComponent = () => (
  <SafeAreaView style={{ flex: 1 }}>
    <App />
  </SafeAreaView>
);

registerRootComponent(RootComponent);

