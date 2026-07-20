import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';

import {
  compareFaces,
  DEFAULT_MATCH_THRESHOLD,
  getFaceMatchModel,
  NoFaceDetectedError,
  type FaceMatchResult,
} from './src/faceMatch';

type ModelStatus =
  | { state: 'loading' }
  | { state: 'ready'; info: string }
  | { state: 'error'; message: string };

type Slot = 'a' | 'b';

export default function App() {
  const [modelStatus, setModelStatus] = useState<ModelStatus>({ state: 'loading' });
  const [photoA, setPhotoA] = useState<string | null>(null);
  const [photoB, setPhotoB] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(String(DEFAULT_MATCH_THRESHOLD));
  const [comparing, setComparing] = useState(false);
  const [result, setResult] = useState<FaceMatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getFaceMatchModel()
      .then((model) => {
        const inputInfo = model.inputs[0];
        const outputInfo = model.outputs[0];
        setModelStatus({
          state: 'ready',
          info: `girdi: ${inputInfo.shape.join('x')} (${inputInfo.dataType}) · çıktı: ${outputInfo.shape.join('x')} (${outputInfo.dataType})`,
        });
      })
      .catch((err: Error) => {
        setModelStatus({
          state: 'error',
          message:
            'Model yüklenemedi. assets/models/mobilefacenet.tflite dosyasını eklediğinden emin ol ' +
            `(bkz. assets/models/README.md).\n\nDetay: ${err.message}`,
        });
      });
  }, []);

  async function pickImage(slot: Slot) {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('İzin gerekli', 'Fotoğraf seçebilmek için galeri erişim izni vermelisin.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
    });

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    const uri = result.assets[0].uri;
    setError(null);
    setResult(null);
    if (slot === 'a') {
      setPhotoA(uri);
    } else {
      setPhotoB(uri);
    }
  }

  async function handleCompare() {
    if (!photoA || !photoB) return;

    const parsedThreshold = Number(threshold.replace(',', '.'));
    if (Number.isNaN(parsedThreshold) || parsedThreshold < 0 || parsedThreshold > 1) {
      setError('Eşik değeri 0 ile 1 arasında bir sayı olmalı.');
      return;
    }

    setComparing(true);
    setError(null);
    setResult(null);

    try {
      const match = await compareFaces(photoA, photoB, parsedThreshold);
      setResult(match);
    } catch (err) {
      if (err instanceof NoFaceDetectedError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Bilinmeyen bir hata oluştu.');
      }
    } finally {
      setComparing(false);
    }
  }

  const canCompare = Boolean(photoA && photoB) && !comparing && modelStatus.state === 'ready';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <StatusBar style="auto" />
      <Text style={styles.title}>Yüz Eşleştirme PoC</Text>
      <Text style={styles.subtitle}>İki fotoğraf seç, aynı kişi mi karşılaştır.</Text>

      <View style={styles.photoRow}>
        <PhotoSlot label="1. Fotoğraf" uri={photoA} onPress={() => pickImage('a')} />
        <PhotoSlot label="2. Fotoğraf" uri={photoB} onPress={() => pickImage('b')} />
      </View>

      <View style={styles.thresholdRow}>
        <Text style={styles.thresholdLabel}>Eşik değeri</Text>
        <TextInput
          style={styles.thresholdInput}
          value={threshold}
          onChangeText={setThreshold}
          keyboardType="decimal-pad"
        />
      </View>

      <Pressable
        style={[styles.compareButton, !canCompare && styles.compareButtonDisabled]}
        disabled={!canCompare}
        onPress={handleCompare}
      >
        {comparing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.compareButtonText}>Karşılaştır</Text>
        )}
      </Pressable>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {result && (
        <View style={[styles.resultBox, result.isMatch ? styles.resultMatch : styles.resultNoMatch]}>
          <Text style={styles.resultTitle}>{result.isMatch ? '✅ Eşleşme' : '❌ Eşleşme yok'}</Text>
          <Text style={styles.resultScore}>Benzerlik: {(result.similarity * 100).toFixed(1)}%</Text>
        </View>
      )}

      <View style={styles.modelStatusBox}>
        {modelStatus.state === 'loading' && (
          <View style={styles.modelStatusRow}>
            <ActivityIndicator size="small" />
            <Text style={styles.modelStatusText}>Model yükleniyor…</Text>
          </View>
        )}
        {modelStatus.state === 'ready' && (
          <Text style={styles.modelStatusText}>Model hazır — {modelStatus.info}</Text>
        )}
        {modelStatus.state === 'error' && (
          <Text style={[styles.modelStatusText, styles.errorText]}>{modelStatus.message}</Text>
        )}
      </View>
    </ScrollView>
  );
}

function PhotoSlot({ label, uri, onPress }: { label: string; uri: string | null; onPress: () => void }) {
  return (
    <Pressable style={styles.photoSlot} onPress={onPress}>
      {uri ? (
        <Image source={{ uri }} style={styles.photoImage} />
      ) : (
        <View style={styles.photoPlaceholder}>
          <Text style={styles.photoPlaceholderText}>+</Text>
        </View>
      )}
      <Text style={styles.photoLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    padding: 24,
    paddingTop: 72,
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  photoRow: {
    flexDirection: 'row',
    gap: 16,
  },
  photoSlot: {
    alignItems: 'center',
    gap: 8,
  },
  photoImage: {
    width: 140,
    height: 140,
    borderRadius: 12,
  },
  photoPlaceholder: {
    width: 140,
    height: 140,
    borderRadius: 12,
    backgroundColor: '#eee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholderText: {
    fontSize: 36,
    color: '#999',
  },
  photoLabel: {
    fontSize: 13,
    color: '#444',
  },
  thresholdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  thresholdLabel: {
    fontSize: 14,
    color: '#333',
  },
  thresholdInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    width: 80,
    textAlign: 'center',
  },
  compareButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
    minWidth: 180,
    alignItems: 'center',
  },
  compareButtonDisabled: {
    backgroundColor: '#a5b4c9',
  },
  compareButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  errorBox: {
    backgroundColor: '#fee2e2',
    borderRadius: 10,
    padding: 14,
    width: '100%',
  },
  errorText: {
    color: '#991b1b',
  },
  resultBox: {
    borderRadius: 12,
    padding: 18,
    width: '100%',
    alignItems: 'center',
    gap: 4,
  },
  resultMatch: {
    backgroundColor: '#dcfce7',
  },
  resultNoMatch: {
    backgroundColor: '#fee2e2',
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  resultScore: {
    fontSize: 15,
  },
  modelStatusBox: {
    marginTop: 'auto',
    paddingTop: 24,
    width: '100%',
  },
  modelStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modelStatusText: {
    fontSize: 12,
    color: '#666',
  },
});
