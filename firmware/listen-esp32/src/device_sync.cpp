#include "device_sync.h"

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <SD.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <mbedtls/sha256.h>
#include <cstring>
#include <ctime>

#include "listen_device_config.h"

namespace {
constexpr size_t kMaxMetaBytes = 900;
constexpr size_t kMaxAckBytes = 4096;
constexpr size_t kBlockBytes = 1024;
constexpr uint8_t kTries = 3;

bool validConfigString(const char *value, const char *placeholder) {
  return value && value[0] && !strstr(value, placeholder);
}

bool plausibleToken() {
  const String token(LISTEN_DEVICE_TOKEN);
  return token.startsWith("abdev_v1_") && token.length() == 52;
}

bool validSha(const String &sha) {
  if (sha.length() != 64) return false;
  for (char c : sha) {
    if (!((c >= 'a' && c <= 'f') || (c >= '0' && c <= '9'))) return false;
  }
  return true;
}

bool digestFile(const String &path, String &outHex, uint32_t &outBytes) {
  File input = SD.open(path.c_str(), FILE_READ);
  if (!input || input.isDirectory()) return false;
  if (input.size() < 44 || input.size() > 10 * 1024 * 1024) {
    input.close();
    return false;
  }
  mbedtls_sha256_context ctx;
  mbedtls_sha256_init(&ctx);
  bool ok = mbedtls_sha256_starts_ret(&ctx, 0) == 0;
  uint8_t buffer[kBlockBytes];
  uint32_t total = 0;
  while (ok && input.available()) {
    const size_t read = input.read(buffer, sizeof(buffer));
    if (!read) { ok = false; break; }
    total += static_cast<uint32_t>(read);
    ok = mbedtls_sha256_update_ret(&ctx, buffer, read) == 0;
  }
  uint8_t digest[32];
  if (ok) ok = mbedtls_sha256_finish_ret(&ctx, digest) == 0;
  mbedtls_sha256_free(&ctx);
  input.close();
  if (!ok) return false;
  outHex = "";
  outHex.reserve(64);
  char hex[3];
  for (uint8_t byte : digest) {
    snprintf(hex, sizeof(hex), "%02x", byte);
    outHex += hex;
  }
  outBytes = total;
  return true;
}

bool readMeta(const String &path, ListenQueuedRecording &out) {
  File file = SD.open(path.c_str(), FILE_READ);
  if (!file || file.isDirectory() || file.size() <= 0 || file.size() > kMaxMetaBytes) {
    if (file) file.close();
    return false;
  }
  StaticJsonDocument<640> doc;
  const auto result = deserializeJson(doc, file);
  file.close();
  if (result || doc["version"] != 1) return false;
  out.recordingId = doc["recordingId"].as<String>();
  out.observedAtUtc = doc["observedAtUtc"].as<String>();
  out.rtcVerified = doc["rtcVerified"].as<bool>();
  out.sha256 = doc["sha256"].as<String>();
  out.audioBytes = doc["audioBytes"].as<uint32_t>();
  out.durationMs = doc["durationMs"].as<uint32_t>();
  if (out.recordingId.length() < 3 || out.recordingId.length() > 128 ||
      !validSha(out.sha256) || out.audioBytes < 44 ||
      out.audioBytes > 10 * 1024 * 1024 ||
      out.durationMs < 1 || out.durationMs > 30000) return false;
  if (out.rtcVerified && (out.observedAtUtc.length() != 20 ||
                          !out.observedAtUtc.endsWith("Z"))) return false;
  if (!out.rtcVerified && out.observedAtUtc.length()) return false;
  return true;
}

bool writeMeta(const String &path, const ListenQueuedRecording &info) {
  StaticJsonDocument<640> doc;
  doc["version"] = 1;
  doc["recordingId"] = info.recordingId;
  doc["observedAtUtc"] = info.observedAtUtc;
  doc["rtcVerified"] = info.rtcVerified;
  doc["sha256"] = info.sha256;
  doc["audioBytes"] = info.audioBytes;
  doc["durationMs"] = info.durationMs;
  File file = SD.open(path.c_str(), FILE_WRITE);
  if (!file) return false;
  const size_t expected = measureJson(doc);
  const size_t actual = serializeJson(doc, file);
  file.flush();
  file.close();
  return expected == actual && expected > 0 && expected <= kMaxMetaBytes;
}

// Always validate the whole WAV against the metadata before each upload. A
// damaged SD card or partial file must never be reported as uploaded.
bool matchesWav(const String &path, const ListenQueuedRecording &meta) {
  String digest;
  uint32_t bytes = 0;
  return digestFile(path, digest, bytes) && bytes == meta.audioBytes &&
         digest == meta.sha256;
}

// Validate durable ACK: 200 alone or matching only recordingId is not enough.
// Keep the ACK bounded even when Next.js responds with chunked transfer
// encoding and no Content-Length. HTTPClient decodes transfer framing here.
class BoundedAckStream : public Stream {
 public:
  String body;
  bool overflow = false;
  BoundedAckStream() { body.reserve(kMaxAckBytes); }
  size_t write(uint8_t byte) override {
    if (body.length() >= kMaxAckBytes) { overflow = true; return 0; }
    body += static_cast<char>(byte);
    return 1;
  }
  size_t write(const uint8_t *data, size_t size) override {
    if (size > kMaxAckBytes - body.length()) { overflow = true; return 0; }
    for (size_t i = 0; i < size; ++i) body += static_cast<char>(data[i]);
    return size;
  }
  int available() override { return 0; }
  int read() override { return -1; }
  int peek() override { return -1; }
  void flush() override {}
  using Print::write;
};

bool committedAck(const String &body, const ListenQueuedRecording &meta) {
  if (body.length() > kMaxAckBytes) return false;
  StaticJsonDocument<1024> ack;
  if (deserializeJson(ack, body)) return false;
  return ack["protocolVersion"] == 1 &&
         ack["status"] == "committed" &&
         ack["deviceId"] == LISTEN_DEVICE_ID &&
         ack["recordingId"] == meta.recordingId &&
         ack["audioSha256"] == meta.sha256 &&
         ack["audioBytes"] == meta.audioBytes &&
         ack["receiptId"].is<const char *>() &&
         strlen(ack["receiptId"].as<const char *>()) >= 8 &&
         ack["observationId"].is<const char *>() &&
         strlen(ack["observationId"].as<const char *>()) >= 8;
}

bool uploadOnce(const String &wavPath, const ListenQueuedRecording &meta,
                bool &retryable) {
  retryable = false;
  WiFiClientSecure tls;
  tls.setCACert(LISTEN_TLS_CA_PEM); // TLS hostname + chain verified by ESP32.
  tls.setTimeout(15);
  HTTPClient http;
  http.setTimeout(20000);
  http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  if (!http.begin(tls, LISTEN_UPLOAD_URL)) return false;
  http.addHeader("Content-Type", "audio/wav");
  http.addHeader("Authorization", String("Bearer ") + LISTEN_DEVICE_TOKEN);
  http.addHeader("X-Device-ID", LISTEN_DEVICE_ID);
  http.addHeader("X-Protocol-Version", "1");
  http.addHeader("X-Recording-ID", meta.recordingId);
  if (meta.rtcVerified) http.addHeader("X-Observed-At", meta.observedAtUtc);
  http.addHeader("X-Clock-Quality", meta.rtcVerified ? "rtc_verified" : "unverified");
  http.addHeader("X-Ingestion-Mode", "historical");
  http.addHeader("X-Audio-SHA256", meta.sha256);
  http.addHeader("X-Audio-Bytes", String(meta.audioBytes));
  http.addHeader("X-Duration-Ms", String(meta.durationMs));

  File wav = SD.open(wavPath.c_str(), FILE_READ);
  if (!wav) { http.end(); return false; }
  const int code = http.sendRequest("POST", &wav, meta.audioBytes);
  wav.close();
  Serial.printf("Device ingestion HTTP status: %d\n", code);
  bool committed = false;
  if (code == 200) {
    BoundedAckStream ackBody;
    const int received = http.writeToStream(&ackBody);
    if (received > 0 && !ackBody.overflow) {
      committed = committedAck(ackBody.body, meta);
    }
    if (!committed) Serial.println("ACK mismatch: retaining original WAV");
  } else if (code < 0 || code == 429 || code == 503 || code == 502 ||
             code == 504 || code == 500 || code == 408) {
    retryable = true;
  } else if (code == 401 || code == 403) {
    Serial.println("Device credential or HTTPS policy rejected; check provisioning/TLS");
  } else if (code == 409) {
    Serial.println("Recording ID conflict: review metadata; retaining WAV");
  } else {
    Serial.println("Device ingestion rejected; retaining WAV for inspection");
  }
  http.end();
  return committed;
}

String canonicalPath(const String &raw) {
  // ESP32 SD may return either basename or absolute path from openNextFile().
  const int lastSlash = raw.lastIndexOf('/');
  return String("/LISTEN/") + raw.substring(lastSlash + 1);
}

bool processManifest(const String &metaPath) {
  ListenQueuedRecording meta;
  if (!readMeta(metaPath, meta)) {
    Serial.println("Invalid local manifest; keeping it for manual recovery");
    return false;
  }
  const String base = metaPath.substring(0, metaPath.length() - 5);
  const String wavPath = base + ".WAV";
  const String tempPath = base + ".PART";
  if (!SD.exists(wavPath.c_str()) && SD.exists(tempPath.c_str())) {
    if (matchesWav(tempPath, meta)) SD.rename(tempPath.c_str(), wavPath.c_str());
  }
  if (!matchesWav(wavPath, meta)) {
    Serial.println("WAV missing or corrupted; keeping metadata for inspection");
    return false;
  }
  if (!listenSyncConfigured() || WiFi.status() != WL_CONNECTED ||
      time(nullptr) < 1735689600) return false;
  for (uint8_t attempt = 0; attempt < kTries; ++attempt) {
    bool retryable = false;
    if (uploadOnce(wavPath, meta, retryable)) {
      // The backend has committed and re-checked private storage. Never
      // remove the evidence before that exact matching ACK.
      if (SD.remove(wavPath.c_str())) {
        if (!SD.remove(metaPath.c_str())) {
          Serial.println("Committed; manifest cleanup pending");
        } else {
          Serial.println("Committed and cleaned local queue");
        }
      } else {
        Serial.println("Committed; WAV removal failed, leaving local copy");
      }
      return true;
    }
    if (!retryable) break;
    if (attempt + 1 < kTries) delay(1500UL * (1U << attempt));
  }
  return false;
}
} // namespace

bool listenSyncConfigured() {
  const String url(LISTEN_UPLOAD_URL);
  return url.startsWith("https://") &&
         url.indexOf("YOUR-APP-HOST") == -1 &&
         validConfigString(LISTEN_DEVICE_ID, "REPLACE_") &&
         validConfigString(LISTEN_DEVICE_TOKEN, "REPLACE_") &&
         plausibleToken() &&
         validConfigString(LISTEN_TLS_CA_PEM, "REPLACE_") &&
         strstr(LISTEN_TLS_CA_PEM, "-----BEGIN CERTIFICATE-----");
}

bool inspectListenWav(const String &path, String &sha256, uint32_t &bytes) {
  return digestFile(path, sha256, bytes);
}

bool enqueueListenRecording(const String &base, const ListenQueuedRecording &info) {
  const String partial = base + ".PART";
  const String finalPath = base + ".WAV";
  const String meta = base + ".META";
  const String metaTmp = base + ".MTMP";
  if (!matchesWav(partial, info) || SD.exists(meta.c_str()) ||
      SD.exists(finalPath.c_str()) || SD.exists(metaTmp.c_str())) return false;
  if (!writeMeta(metaTmp, info)) return false;
  if (!SD.rename(metaTmp.c_str(), meta.c_str())) return false;
  if (!SD.rename(partial.c_str(), finalPath.c_str())) {
    Serial.println("WAV rename deferred; startup recovery can retry");
    return false;
  }
  return true;
}

void recoverListenQueue() {
  // A manifest may be committed before the final .PART -> .WAV rename.
  File dir = SD.open("/LISTEN");
  if (!dir || !dir.isDirectory()) return;
  String paths[64];
  size_t count = 0;
  while (count < 64) {
    File item = dir.openNextFile();
    if (!item) break;
    const String path = canonicalPath(item.name());
    if (!item.isDirectory() && path.endsWith(".META")) paths[count++] = path;
    item.close();
  }
  dir.close();
  for (size_t i = 0; i < count; ++i) {
    ListenQueuedRecording meta;
    if (!readMeta(paths[i], meta)) continue;
    String base = paths[i].substring(0, paths[i].length() - 5);
    String partial = base + ".PART";
    String wav = base + ".WAV";
    if (!SD.exists(wav.c_str()) && SD.exists(partial.c_str()) &&
        matchesWav(partial, meta) && SD.rename(partial.c_str(), wav.c_str())) {
      Serial.println("Recovered pending WAV after interrupted rename");
    }
  }
}

uint16_t countListenPending() {
  File dir = SD.open("/LISTEN");
  if (!dir || !dir.isDirectory()) return 0;
  uint16_t count = 0;
  while (true) {
    File item = dir.openNextFile();
    if (!item) break;
    if (!item.isDirectory() && String(item.name()).endsWith(".META")) ++count;
    item.close();
  }
  dir.close();
  return count;
}

void syncListenPending(uint8_t maxFiles) {
  if (!listenSyncConfigured()) {
    Serial.println("Upload skipped: configure local HTTPS URL, device token and CA cert");
    return;
  }
  if (WiFi.status() != WL_CONNECTED || time(nullptr) < 1735689600) {
    Serial.println("Upload deferred: WiFi or trusted system clock unavailable");
    return;
  }
  const uint16_t total = countListenPending();
  if (!total) return;
  const uint8_t capacity = min(maxFiles, static_cast<uint8_t>(8));
  const uint8_t needed = static_cast<uint8_t>(min(static_cast<uint16_t>(capacity), total));
  // Round robin avoids an invalid persistent manifest permanently blocking
  // later valid recordings on the same SD card.
  static uint32_t roundRobinCursor = 0;
  const uint16_t start = static_cast<uint16_t>(roundRobinCursor % total);
  roundRobinCursor = start + needed;
  String paths[8];
  uint8_t found = 0;
  File dir = SD.open("/LISTEN");
  if (!dir || !dir.isDirectory()) return;
  uint16_t index = 0;
  while (true) {
    File item = dir.openNextFile();
    if (!item) break;
    const String path = canonicalPath(item.name());
    if (!item.isDirectory() && path.endsWith(".META")) {
      const uint16_t position = static_cast<uint16_t>((index + total - start) % total);
      if (position < needed) paths[found++] = path;
      ++index;
    }
    item.close();
  }
  dir.close();
  for (uint8_t i = 0; i < found; ++i) processManifest(paths[i]);
}
