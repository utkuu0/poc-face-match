# Yüz Eşleştirme PoC

Doğum günü takvimi projesinin **Adım 0**'ı: iki fotoğraf seçip aynı kişi olup
olmadığını cihaz üzerinde (on-device) kontrol eden tek ekranlık bir Expo
uygulaması.

Pipeline: **ML Kit** (yüz tespiti) → **expo-image-manipulator** (yüzü kırpıp
112x112'ye küçültme) → **jpeg-js** (piksel verisine çözme) →
**react-native-fast-tflite + MobileFaceNet** (embedding çıkarma) →
**cosine similarity** (karşılaştırma).

> Bu uygulama native modül (ML Kit, TFLite) içerdiği için **Expo Go'da
> çalışmaz**. Bir Expo Dev Client build'i gerekiyor.

## 1. Bağımlılıkları kur

```bash
cd poc-face-match
npm install
```

## 2. Modeli indir

`assets/models/mobilefacenet.tflite` dosyası bu repoda yok (binary model
dosyası, indirmen gerekiyor). Adımlar için
[`assets/models/README.md`](./assets/models/README.md) dosyasına bak.

Bu dosya olmadan uygulama Metro bundling aşamasında
`Unable to resolve module ../assets/models/mobilefacenet.tflite` hatası
verecektir — bu beklenen bir durum, model dosyasını eklediğinde düzelir.

## 3. Dev Client build'i al

Native modül içerdiği için önce bir development build almalısın. Bu makinede
Android SDK / Xcode kurulu değilse **EAS Build** (bulut derleme) en pratik yol:

```bash
npm install -g eas-cli
eas login
eas build --profile development --platform android
```

Build bitince EAS sana bir `.apk` (Android) veya TestFlight/`.ipa` (iOS) linki
verecek. Telefonuna kurup aç.

Yerelde (Android Studio + JDK kuruluysa) derlemek istersen:

```bash
npx expo prebuild
npx expo run:android   # ya da: npx expo run:ios (sadece macOS)
```

## 4. Metro'yu başlat

```bash
npx expo start --dev-client
```

Telefonundaki dev client uygulaması QR kodu okutup Metro'ya bağlanacak.

## 5. Kullanım

1. İki fotoğraf seç (galeriden).
2. "Karşılaştır" butonuna bas.
3. Benzerlik yüzdesini ve eşleşme sonucunu gör. Eşik değerini (varsayılan
   `0.7`) ekrandan değiştirebilirsin.

Ekranın altında modelin girdi/çıktı boyut ve veri tipi bilgisi görünür — bu
bilgi, indirdiğin `.tflite` dosyası varsayılanlardan farklıysa
`src/faceMatch.ts` içinde neyi güncellemen gerektiğini anlamana yardımcı olur
(bkz. `assets/models/README.md`).

## Sorun giderme

- **"Unable to resolve module .../mobilefacenet.tflite"** → model dosyasını
  eklemedin, adım 2'ye bak.
- **"FaceDetection doesn't seem to be linked" / native module hatası** →
  Expo Go kullanıyorsundur, dev client build'i alıp onu kullanmalısın (adım 3).
- **Model yükleniyor ama embedding'ler anlamsız / her zaman düşük/yüksek
  benzerlik çıkıyor** → muhtemelen model girdi normalizasyonu
  (`rgbaToModelInputBuffer` içindeki `[-1, 1]` varsayımı) indirdiğin model
  varyantıyla uyuşmuyor. Ekrandaki girdi/çıktı bilgisine ve
  `assets/models/README.md`'deki Netron ipucuna bak.
- **Paket kurulum hataları (versiyon uyuşmazlığı)** → kütüphane
  versiyonları hızlı değişiyor; "bu paketi Expo SDK 57 ile uyumlu en güncel
  sürüme güncelle" diyerek devam edebilirsin.

## PoC çalıştıktan sonra

Bu PoC doğrulandıktan sonra proje köküne dönüp
`dogum-gunu-projesi-prompt-seti.md` dosyasındaki **Adım 1 — Monorepo
Kurulumu** ile devam edilecek. Buradaki `src/faceMatch.ts` mantığı, dosyanın
**Adım 8**'inde asıl mobil uygulamaya (`apps/mobile`) taşınacak.
