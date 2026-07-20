import { useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import CompareScreen from './src/CompareScreen';
import GallerySearchScreen from './src/GallerySearchScreen';

type Mode = 'compare' | 'search';

export default function App() {
  const [mode, setMode] = useState<Mode>('search');

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="auto" />
      <Text style={styles.title}>Yüz Eşleştirme PoC</Text>

      <View style={styles.tabRow}>
        <TabButton label="Galeride Ara" active={mode === 'search'} onPress={() => setMode('search')} />
        <TabButton label="İki Fotoğraf Karşılaştır" active={mode === 'compare'} onPress={() => setMode('compare')} />
      </View>

      {mode === 'search' ? <GallerySearchScreen /> : <CompareScreen />}
    </SafeAreaView>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.tabButton, active && styles.tabButtonActive]} onPress={onPress}>
      <Text style={[styles.tabButtonText, active && styles.tabButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 12,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#eee',
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#2563eb',
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#444',
  },
  tabButtonTextActive: {
    color: '#fff',
  },
});
