import { Image } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import FaceDetection, { type Face } from '@react-native-ml-kit/face-detection';
import { decode as decodeJpeg } from 'jpeg-js';
import { toByteArray as base64ToByteArray } from 'base64-js';
import { loadTensorflowModel, type Tensor, type TensorflowModel } from 'react-native-fast-tflite';

/**
 * MobileFaceNet varyantlarının neredeyse tamamı 112x112 RGB girdi bekler.
 * Farklı bir .tflite dosyası kullanırsan model.inputs[0].shape'e bakıp güncelle.
 */
export const MODEL_INPUT_SIZE = 112;
export const DEFAULT_MATCH_THRESHOLD = 0.7;

// Yüz kutusunun etrafında bırakılan pay: MobileFaceNet, sadece göz/kaş/burun/ağız
// hizasına sıkı kırpılmış kutulardan çok, biraz bağlamlı (saç/çene dahil) kırpımlarla
// daha iyi embedding üretir.
const FACE_CROP_MARGIN_RATIO = 0.25;

export class NoFaceDetectedError extends Error {
  constructor(label?: string) {
    super(label ? `${label} fotoğrafında yüz bulunamadı.` : 'Fotoğrafta yüz bulunamadı.');
    this.name = 'NoFaceDetectedError';
  }
}

let modelPromise: Promise<TensorflowModel> | null = null;

/**
 * Modeli tek seferliğine belleğe yükler ve tekrar kullanır.
 * assets/models/mobilefacenet.tflite yoksa Metro bundling anında hata verir
 * (bkz. assets/models/README.md).
 */
export function getFaceMatchModel(): Promise<TensorflowModel> {
  if (!modelPromise) {
    modelPromise = loadTensorflowModel(require('../assets/models/mobilefacenet.tflite'), []);
  }
  return modelPromise;
}

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

async function detectLargestFace(uri: string, label?: string): Promise<Face> {
  const faces = await FaceDetection.detect(uri, {
    performanceMode: 'accurate',
    landmarkMode: 'none',
    contourMode: 'none',
    classificationMode: 'none',
  });

  if (faces.length === 0) {
    throw new NoFaceDetectedError(label);
  }

  // Fotoğrafta birden fazla yüz varsa en büyük (muhtemelen ana özne olan) yüzü kullan.
  return faces.reduce((largest, face) =>
    face.frame.width * face.frame.height > largest.frame.width * largest.frame.height ? face : largest
  );
}

async function cropFaceToModelInputBase64(uri: string, face: Face): Promise<string> {
  const { width: imageWidth, height: imageHeight } = await getImageSize(uri);
  const { frame } = face;

  const marginX = frame.width * FACE_CROP_MARGIN_RATIO;
  const marginY = frame.height * FACE_CROP_MARGIN_RATIO;

  const originX = Math.max(0, Math.round(frame.left - marginX));
  const originY = Math.max(0, Math.round(frame.top - marginY));
  const width = Math.min(imageWidth - originX, Math.round(frame.width + marginX * 2));
  const height = Math.min(imageHeight - originY, Math.round(frame.height + marginY * 2));

  const imageRef = await ImageManipulator.manipulate(uri)
    .crop({ originX, originY, width, height })
    .resize({ width: MODEL_INPUT_SIZE, height: MODEL_INPUT_SIZE })
    .renderAsync();

  const result = await imageRef.saveAsync({
    format: SaveFormat.JPEG,
    compress: 1,
    base64: true,
  });

  if (!result.base64) {
    throw new Error('Kırpılan yüz fotoğrafı base64 formatına çevrilemedi.');
  }

  return result.base64;
}

/** jpeg-js her zaman RGBA (4 kanal) döner; JPEG'de alfa olmasa da 255 ile doldurulur. */
function decodeJpegBase64ToRgba(base64: string): Uint8Array {
  const bytes = base64ToByteArray(base64);
  const { data } = decodeJpeg(bytes, { useTArray: true });
  return data;
}

function rgbaToModelInputBuffer(rgba: Uint8Array, dataType: Tensor['dataType']): ArrayBuffer {
  const pixelCount = rgba.length / 4;

  if (dataType === 'uint8') {
    const out = new Uint8Array(pixelCount * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      out[j] = rgba[i];
      out[j + 1] = rgba[i + 1];
      out[j + 2] = rgba[i + 2];
    }
    return out.buffer;
  }

  if (dataType !== 'float32') {
    // eslint-disable-next-line no-console
    console.warn(
      `Beklenmeyen model girdi tipi "${dataType}", float32 gibi işleniyor. ` +
        'Gerekirse rgbaToModelInputBuffer fonksiyonunu bu tipe göre güncelle.'
    );
  }

  // float32 modeller genelde [-1, 1] aralığında normalize edilmiş piksel bekler.
  const out = new Float32Array(pixelCount * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    out[j] = (rgba[i] - 127.5) / 127.5;
    out[j + 1] = (rgba[i + 1] - 127.5) / 127.5;
    out[j + 2] = (rgba[i + 2] - 127.5) / 127.5;
  }
  return out.buffer;
}

function outputBufferToEmbedding(buffer: ArrayBuffer, dataType: Tensor['dataType']): number[] {
  switch (dataType) {
    case 'float32':
      return Array.from(new Float32Array(buffer));
    case 'uint8':
      return Array.from(new Uint8Array(buffer));
    case 'int8':
      return Array.from(new Int8Array(buffer));
    default:
      throw new Error(`Desteklenmeyen model çıktı veri tipi: ${dataType}`);
  }
}

/**
 * Bir fotoğraftaki en belirgin yüzü tespit eder, kırpıp modele uygun boyuta getirir
 * ve MobileFaceNet embedding vektörünü döndürür.
 */
export async function getFaceEmbedding(photoUri: string, label?: string): Promise<number[]> {
  const model = await getFaceMatchModel();
  const face = await detectLargestFace(photoUri, label);
  const croppedBase64 = await cropFaceToModelInputBase64(photoUri, face);
  const rgba = decodeJpegBase64ToRgba(croppedBase64);

  const inputBuffer = rgbaToModelInputBuffer(rgba, model.inputs[0].dataType);
  const [outputBuffer] = await model.run([inputBuffer]);

  return outputBufferToEmbedding(outputBuffer, model.outputs[0].dataType);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Embedding boyutları eşleşmiyor: ${a.length} vs ${b.length}`);
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface FaceMatchResult {
  similarity: number;
  isMatch: boolean;
}

export async function compareFaces(
  photoUriA: string,
  photoUriB: string,
  threshold: number = DEFAULT_MATCH_THRESHOLD
): Promise<FaceMatchResult> {
  const [embeddingA, embeddingB] = await Promise.all([
    getFaceEmbedding(photoUriA, '1. fotoğraf'),
    getFaceEmbedding(photoUriB, '2. fotoğraf'),
  ]);

  const similarity = cosineSimilarity(embeddingA, embeddingB);
  return { similarity, isMatch: similarity >= threshold };
}
