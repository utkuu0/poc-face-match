import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';

import {
  cosineSimilarity,
  DEFAULT_MATCH_THRESHOLD,
  getAllFaceEmbeddings,
  getFaceEmbedding,
  NoFaceDetectedError,
} from './faceMatch';
import { clearScanCache, getCachedScan, setCachedScan } from './photoCache';

interface MatchItem {
  assetId: string;
  uri: string;
  similarity: number;
}

type ScanState =
  | { phase: 'idle' }
  | { phase: 'scanning'; processed: number; total: number }
  | { phase: 'done'; processed: number; total: number; cancelled: boolean };

export default function GallerySearchScreen() {
  const [referenceUri, setReferenceUri] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(String(DEFAULT_MATCH_THRESHOLD));
  const [scanState, setScanState] = useState<ScanState>({ phase: 'idle' });
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const cancelledRef = useRef(false);

  const pickReferencePhoto = useCallback(async () => {
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

    if (result.canceled || result.assets.length === 0) return;

    setReferenceUri(result.assets[0].uri);
    setMatches([]);
    setError(null);
    setScanState({ phase: 'idle' });
  }, []);

  const startScan = useCallback(async () => {
    if (!referenceUri) return;

    const parsedThreshold = Number(threshold.replace(',', '.'));
    if (Number.isNaN(parsedThreshold) || parsedThreshold < 0 || parsedThreshold > 1) {
      setError('Eşik değeri 0 ile 1 arasında bir sayı olmalı.');
      return;
    }

    const mediaPermission = await MediaLibrary.requestPermissionsAsync();
    if (!mediaPermission.granted) {
      Alert.alert('İzin gerekli', 'Galeriyi tarayabilmek için medya erişim izni vermelisin.');
      return;
    }

    setError(null);
    setMatches([]);
    cancelledRef.current = false;

    let referenceEmbedding: number[];
    try {
      referenceEmbedding = await getFaceEmbedding(referenceUri, 'Referans fotoğraf');
    } catch (err) {
      setError(err instanceof NoFaceDetectedError ? err.message : 'Referans fotoğraf işlenemedi.');
      return;
    }

    let metadata;
    try {
      metadata = await new MediaLibrary.Query()
        .eq(MediaLibrary.AssetField.MEDIA_TYPE, MediaLibrary.MediaType.IMAGE)
        .orderBy({ key: MediaLibrary.AssetField.CREATION_TIME, ascending: false })
        .exeForMetadata();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Galeri okunamadı.');
      return;
    }

    const total = metadata.length;
    setScanState({ phase: 'scanning', processed: 0, total });

    const found: MatchItem[] = [];

    for (let i = 0; i < metadata.length; i++) {
      if (cancelledRef.current) break;

      const assetId = metadata[i].id;

      try {
        let embeddings: number[][];
        const cached = await getCachedScan(assetId);

        if (cached) {
          embeddings = cached.embeddings;
        } else {
          const asset = new MediaLibrary.Asset(assetId);
          const uri = await asset.getUri();
          embeddings = await getAllFaceEmbeddings(uri);
          await setCachedScan(assetId, { faceCount: embeddings.length, embeddings });
        }

        const bestSimilarity = embeddings.reduce(
          (best, embedding) => Math.max(best, cosineSimilarity(referenceEmbedding, embedding)),
          -1
        );

        if (bestSimilarity >= parsedThreshold) {
          const asset = new MediaLibrary.Asset(assetId);
          const uri = await asset.getUri();
          found.push({ assetId, uri, similarity: bestSimilarity });
          setMatches([...found].sort((a, b) => b.similarity - a.similarity));
        }
      } catch {
        // Bozuk/okunamayan tek bir fotoğraf taramanın tamamını durdurmasın.
      }

      setScanState({ phase: 'scanning', processed: i + 1, total });
    }

    setScanState({ phase: 'done', processed: metadata.length, total, cancelled: cancelledRef.current });
  }, [referenceUri, threshold]);

  function cancelScan() {
    cancelledRef.current = true;
  }

  async function handleClearCache() {
    await clearScanCache();
    Alert.alert('Tamam', 'Tarama önbelleği temizlendi. Bir sonraki tarama tüm fotoğrafları yeniden işleyecek.');
  }

  const scanning = scanState.phase === 'scanning';
  const canScan = Boolean(referenceUri) && !scanning;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.subtitle}>
        Bir referans fotoğraf seç, galerideki fotoğrafları tarayıp aynı kişiyi bul.
      </Text>

      <Pressable style={styles.referenceSlot} onPress={pickReferencePhoto}>
        {referenceUri ? (
          <Image source={{ uri: referenceUri }} style={styles.referenceImage} />
        ) : (
          <View style={styles.referencePlaceholder}>
            <Text style={styles.referencePlaceholderText}>+</Text>
          </View>
        )}
        <Text style={styles.photoLabel}>Referans fotoğraf</Text>
      </Pressable>

      <View style={styles.thresholdRow}>
        <Text style={styles.thresholdLabel}>Eşik değeri</Text>
        <TextInput
          style={styles.thresholdInput}
          value={threshold}
          onChangeText={setThreshold}
          keyboardType="decimal-pad"
          editable={!scanning}
        />
      </View>

      {!scanning ? (
        <Pressable
          style={[styles.scanButton, !canScan && styles.scanButtonDisabled]}
          disabled={!canScan}
          onPress={startScan}
        >
          <Text style={styles.scanButtonText}>Galeriyi Tara</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.cancelButton} onPress={cancelScan}>
          <Text style={styles.scanButtonText}>İptal</Text>
        </Pressable>
      )}

      {scanState.phase !== 'idle' && (
        <View style={styles.progressBox}>
          {scanning && <ActivityIndicator size="small" />}
          <Text style={styles.progressText}>
            {scanState.phase === 'scanning' &&
              `${scanState.processed} / ${scanState.total} fotoğraf tarandı…`}
            {scanState.phase === 'done' &&
              (scanState.cancelled
                ? `İptal edildi — ${scanState.processed} / ${scanState.total} tarandı, ${matches.length} eşleşme bulundu.`
                : `Tarama bitti — ${scanState.processed} fotoğraf tarandı, ${matches.length} eşleşme bulundu.`)}
          </Text>
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {matches.length > 0 && (
        <FlatList
          data={matches}
          keyExtractor={(item) => item.assetId}
          numColumns={3}
          scrollEnabled={false}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <Pressable style={styles.gridItem} onPress={() => setPreviewUri(item.uri)}>
              <Image source={{ uri: item.uri }} style={styles.gridImage} />
              <Text style={styles.gridScore}>{(item.similarity * 100).toFixed(0)}%</Text>
            </Pressable>
          )}
        />
      )}

      <Pressable style={styles.clearCacheButton} onPress={handleClearCache} disabled={scanning}>
        <Text style={styles.clearCacheText}>Tarama önbelleğini temizle</Text>
      </Pressable>

      <Modal visible={previewUri !== null} transparent animationType="fade" onRequestClose={() => setPreviewUri(null)}>
        <Pressable style={styles.previewBackdrop} onPress={() => setPreviewUri(null)}>
          {previewUri && <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="contain" />}
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    padding: 24,
    paddingTop: 24,
    gap: 16,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  referenceSlot: {
    alignItems: 'center',
    gap: 8,
  },
  referenceImage: {
    width: 140,
    height: 140,
    borderRadius: 12,
  },
  referencePlaceholder: {
    width: 140,
    height: 140,
    borderRadius: 12,
    backgroundColor: '#eee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  referencePlaceholderText: {
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
  scanButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
    minWidth: 180,
    alignItems: 'center',
  },
  scanButtonDisabled: {
    backgroundColor: '#a5b4c9',
  },
  cancelButton: {
    backgroundColor: '#dc2626',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
    minWidth: 180,
    alignItems: 'center',
  },
  scanButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  progressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressText: {
    fontSize: 13,
    color: '#444',
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
  grid: {
    width: '100%',
    gap: 8,
  },
  gridRow: {
    gap: 8,
    marginBottom: 8,
  },
  gridItem: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  gridScore: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  clearCacheButton: {
    paddingVertical: 8,
  },
  clearCacheText: {
    fontSize: 12,
    color: '#888',
    textDecorationLine: 'underline',
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    width: '100%',
    height: '80%',
  },
});
