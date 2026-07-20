# MobileFaceNet modeli

Bu klasöre `mobilefacenet.tflite` adında bir model dosyası eklemen gerekiyor.
Dosya boyutu küçük olduğu için (~5 MB) repoya commit'lemek istersen sorun değil,
ama `.gitignore` şu an bunu hariç tutuyor — istersen o satırı kaldırabilirsin.

## Nereden bulunur

Hazır, yaygın kullanılan bir MobileFaceNet `.tflite` dosyası şu repolarda mevcut:

- https://github.com/MCarlomagno/FaceRecognitionAuth/blob/master/assets/mobilefacenet.tflite
- https://github.com/ngtrphuong/facerecognition (assets klasörü)
- https://github.com/syaringan357/Android-MobileFaceNet-MTCNN-FaceAntiSpoofing

Dosyayı indirip bu klasöre `mobilefacenet.tflite` adıyla koy.

## Girdi/çıktı formatını doğrula

Modeller arasında girdi boyutu (genelde 112x112x3) ve veri tipi (float32 ya da
quantized uint8) farklılık gösterebilir. Uygulamayı ilk açtığında ekranın
altında "Model hazır — girdi: ... çıktı: ..." satırı bu bilgiyi gösterecek.

- Girdi boyutu 112x112'den farklıysa `src/faceMatch.ts` içindeki
  `MODEL_INPUT_SIZE` sabitini güncelle.
- Girdi/çıktı veri tipi `float32` değilse (örn. `uint8`),
  `rgbaToModelInputBuffer` ve `outputBufferToEmbedding` fonksiyonlarındaki
  normalizasyon mantığını o tipe göre uyarlaman gerekebilir.
- Emin olmak istersen modeli https://netron.app adresine sürükleyip
  girdi/çıktı katmanlarını görsel olarak inceleyebilirsin.

## Not

Bu proje embedding'leri hiçbir sunucuya göndermez, tüm işlem cihaz üzerinde
(on-device) yapılır.
