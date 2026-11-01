#include <Arduino.h>
#include <Preferences.h> // LISTEN_USB_V1
#include <SD.h>
#include <SPI.h>
#include <WiFi.h>
#include <Wire.h>
#include <driver/i2s.h>

#include <math.h>
#include <string.h>
#include <time.h>

// Create include/listen_secrets.h locally from listen_secrets.example.h.
// Never commit the real Wi-Fi password.
#include "listen_secrets.h"
#include "listen_device_config.h"
#include "device_sync.h"
#include "listen_remote.h"
#include <esp_system.h>

// AUVRION BIOSPHERE - AB-WC-015
// Milestone: RTC + INMP441 + microSD-backed offline WAV queue + secure WC-017 sync.
// Manual serial capture, non-destructive retry, verified durable backend ACK.

// INMP441 (wiring previously validated with I2S_CHANNEL_FMT_ONLY_RIGHT)
constexpr int MIC_BCLK = 26;
constexpr int MIC_WS = 25;
constexpr int MIC_DATA = 33;

// HW-125 microSD (5 V-capable module powered from ESP32 VIN)
constexpr int SD_CS = 5;
constexpr int SD_SCK = 18;
constexpr int SD_MISO = 19;
constexpr int SD_MOSI = 23;

// DS3231 RTC (module powered at 3V3)
constexpr int RTC_SDA = 21;
constexpr int RTC_SCL = 22;
constexpr uint8_t RTC_ADDR = 0x68;
constexpr uint8_t RTC_OSF = 0x80;

constexpr uint32_t SAMPLE_RATE = 16000;
constexpr uint32_t RECORD_SECONDS = 10;
constexpr uint32_t TOTAL_SAMPLES = SAMPLE_RATE * RECORD_SECONDS;
constexpr size_t BUFFER_SAMPLES = 512;
constexpr uint32_t SD_SPI_HZ = 4000000; // Proven in prior WAV recording test.
constexpr float AUDIO_GAIN = 2.0f; // Lower gain for clipping test.
constexpr i2s_port_t MIC_I2S_PORT = I2S_NUM_0;

struct UtcTime {
  int year;
  int month;
  int day;
  int hour;
  int minute;
  int second;
};

static uint8_t toBcd(int value) {
  return static_cast<uint8_t>((value / 10) * 16 + value % 10);
}

static int fromBcd(uint8_t value) {
  return (value >> 4) * 10 + (value & 0x0F);
}

static bool validUtc(const UtcTime &t) {
  if (t.year < 2025 || t.year > 2099 || t.month < 1 || t.month > 12 ||
      t.hour < 0 || t.hour > 23 || t.minute < 0 || t.minute > 59 ||
      t.second < 0 || t.second > 59) {
    return false;
  }

  const int daysPerMonth[] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
  int maxDay = daysPerMonth[t.month - 1];
  const bool leap = (t.year % 4 == 0 && (t.year % 100 != 0 || t.year % 400 == 0));
  if (t.month == 2 && leap) ++maxDay;
  return t.day >= 1 && t.day <= maxDay;
}

static bool rtcReadRegister(uint8_t reg, uint8_t &value) {
  Wire.beginTransmission(RTC_ADDR);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(RTC_ADDR, static_cast<uint8_t>(1)) != 1) return false;
  value = Wire.read();
  return true;
}

static bool rtcReadUtc(UtcTime &out, bool &oscillatorStopped) {
  uint8_t status = 0;
  if (!rtcReadRegister(0x0F, status)) return false;
  oscillatorStopped = (status & RTC_OSF) != 0;

  Wire.beginTransmission(RTC_ADDR);
  Wire.write(static_cast<uint8_t>(0x00));
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(RTC_ADDR, static_cast<uint8_t>(7)) != 7) return false;

  out.second = fromBcd(Wire.read() & 0x7F);
  out.minute = fromBcd(Wire.read() & 0x7F);
  const uint8_t hourReg = Wire.read();
  if ((hourReg & 0x40) != 0) {
    const int h12 = fromBcd(hourReg & 0x1F);
    out.hour = (h12 % 12) + ((hourReg & 0x20) ? 12 : 0);
  } else {
    out.hour = fromBcd(hourReg & 0x3F);
  }
  Wire.read();  // Day of week
  out.day = fromBcd(Wire.read() & 0x3F);
  const uint8_t monthReg = Wire.read();
  out.month = fromBcd(monthReg & 0x1F);
  out.year = 2000 + fromBcd(Wire.read()) + ((monthReg & 0x80) ? 100 : 0);

  return validUtc(out);
}

static bool rtcWriteUtc(const struct tm &utc) {
  const UtcTime candidate = {
      utc.tm_year + 1900,
      utc.tm_mon + 1,
      utc.tm_mday,
      utc.tm_hour,
      utc.tm_min,
      utc.tm_sec,
  };
  if (!validUtc(candidate)) return false;

  Wire.beginTransmission(RTC_ADDR);
  Wire.write(static_cast<uint8_t>(0x00));
  Wire.write(toBcd(candidate.second));
  Wire.write(toBcd(candidate.minute));
  Wire.write(toBcd(candidate.hour));
  Wire.write(toBcd(utc.tm_wday + 1));
  Wire.write(toBcd(candidate.day));
  Wire.write(toBcd(candidate.month));
  Wire.write(toBcd(candidate.year - 2000));
  if (Wire.endTransmission() != 0) return false;

  // Preserve DS3231 status bits other than the oscillator-stop flag.
  uint8_t status = 0;
  if (!rtcReadRegister(0x0F, status)) return false;
  Wire.beginTransmission(RTC_ADDR);
  Wire.write(static_cast<uint8_t>(0x0F));
  Wire.write(static_cast<uint8_t>(status & ~RTC_OSF));
  if (Wire.endTransmission() != 0) return false;

  UtcTime check = {};
  bool osf = true;
  if (!rtcReadUtc(check, osf) || osf) return false;
  return true;
}

static bool syncRtcFromNtp() {
  Serial.println("WiFi: connecting (2.4 GHz required)...");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  const uint32_t started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < 20000UL) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("ERROR: WiFi unavailable; RTC timestamp NOT verified");
    return false;
  }
  Serial.println("WiFi: connected");

  // UTC: no WITA offset is written into the RTC.
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  struct tm localUtc = {};
  if (!getLocalTime(&localUtc, 20000) || localUtc.tm_year + 1900 < 2025) {
    Serial.println("ERROR: NTP time unavailable");
    return false;
  }

  // Always use gmtime_r so RTC stays UTC regardless of process TZ.
  const time_t now = time(nullptr);
  struct tm utc = {};
  if (now < 1735689600 || gmtime_r(&now, &utc) == nullptr) {
    Serial.println("ERROR: Invalid UTC system clock");
    return false;
  }
  if (!rtcWriteUtc(utc)) {
    Serial.println("ERROR: DS3231 could not be set or verified");
    return false;
  }

  Serial.println("SUCCESS: DS3231 synchronized with NTP (UTC)");
  return true;
}

static void printRtcTime(const UtcTime &utc) {
  Serial.printf("RTC UTC: %04d-%02d-%02d %02d:%02d:%02d\n",
                utc.year, utc.month, utc.day,
                utc.hour, utc.minute, utc.second);
}

static String uniqueRecordingBase() {
  // Hardware entropy after Wi-Fi bringup. The ID remains persisted in .META
  // across retries/reboots; it must never be regenerated for one WAV.
  for (int attempt = 0; attempt < 8; ++attempt) {
    char name[60] = {};
    snprintf(name, sizeof(name), "/LISTEN/R%08lX%08lX%08lX",
             static_cast<unsigned long>(ESP.getEfuseMac() & 0xFFFFFFFF),
             static_cast<unsigned long>(esp_random()),
             static_cast<unsigned long>(esp_random()));
    const String base(name);
    if (!SD.exists((base + ".WAV").c_str()) &&
        !SD.exists((base + ".PART").c_str()) &&
        !SD.exists((base + ".META").c_str()) &&
        !SD.exists((base + ".MTMP").c_str())) return base;
  }
  return "";
}

static String utcHeader(const UtcTime &utc) {
  char value[22] = {};
  snprintf(value, sizeof(value), "%04d-%02d-%02dT%02d:%02d:%02dZ",
           utc.year, utc.month, utc.day, utc.hour, utc.minute, utc.second);
  return String(value);
}

static bool startMicrophone() {
  i2s_config_t config = {};
  config.mode = static_cast<i2s_mode_t>(I2S_MODE_MASTER | I2S_MODE_RX);
  config.sample_rate = SAMPLE_RATE;
  config.bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT;
  // Preserve the working channel from the earlier physical RMS test.
  // L/R is wired to GND; channel selection will be revalidated after listening.
  config.channel_format = I2S_CHANNEL_FMT_ONLY_RIGHT;
  config.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  config.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
  config.dma_buf_count = 8;
  config.dma_buf_len = 256;
  config.use_apll = false;

  i2s_pin_config_t pins = {};
  pins.bck_io_num = MIC_BCLK;
  pins.ws_io_num = MIC_WS;
  pins.data_out_num = I2S_PIN_NO_CHANGE;
  pins.data_in_num = MIC_DATA;

  const esp_err_t installed = i2s_driver_install(MIC_I2S_PORT, &config, 0, nullptr);
  if (installed != ESP_OK) {
    Serial.printf("ERROR: i2s_driver_install failed (%d)\n", installed);
    return false;
  }
  const esp_err_t configured = i2s_set_pin(MIC_I2S_PORT, &pins);
  if (configured != ESP_OK) {
    Serial.printf("ERROR: i2s_set_pin failed (%d)\n", configured);
    i2s_driver_uninstall(MIC_I2S_PORT);
    return false;
  }
  return true;
}

static void write16(File &file, uint16_t value) {
  file.write(static_cast<uint8_t>(value & 0xFF));
  file.write(static_cast<uint8_t>((value >> 8) & 0xFF));
}

static void write32(File &file, uint32_t value) {
  for (unsigned int i = 0; i < 4; ++i) {
    file.write(static_cast<uint8_t>((value >> (8 * i)) & 0xFF));
  }
}

static bool writeWavHeader(File &file, uint32_t audioBytes) {
  if (!file.seek(0)) return false;
  if (file.write(reinterpret_cast<const uint8_t *>("RIFF"), 4) != 4) return false;
  write32(file, 36 + audioBytes);
  if (file.write(reinterpret_cast<const uint8_t *>("WAVEfmt "), 8) != 8) return false;
  write32(file, 16); // PCM format chunk size
  write16(file, 1); // signed integer PCM
  write16(file, 1); // mono
  write32(file, SAMPLE_RATE);
  write32(file, SAMPLE_RATE * 2); // bytes per second
  write16(file, 2); // block alignment
  write16(file, 16); // bits per sample
  if (file.write(reinterpret_cast<const uint8_t *>("data"), 4) != 4) return false;
  write32(file, audioBytes);
  return true;
}

static bool verifyWavOnSd(const char *path, uint32_t expectedAudioBytes) {
  File file = SD.open(path, FILE_READ);
  if (!file) {
    Serial.println("ERROR: cannot reopen WAV");
    return false;
  }
  const uint32_t actualSize = file.size();
  uint8_t header[44] = {};
  const size_t headerBytes = file.read(header, sizeof(header));
  file.close();

  const uint32_t headerRiffSize = static_cast<uint32_t>(header[4]) |
      (static_cast<uint32_t>(header[5]) << 8) |
      (static_cast<uint32_t>(header[6]) << 16) |
      (static_cast<uint32_t>(header[7]) << 24);
  const uint32_t headerAudioBytes = static_cast<uint32_t>(header[40]) |
      (static_cast<uint32_t>(header[41]) << 8) |
      (static_cast<uint32_t>(header[42]) << 16) |
      (static_cast<uint32_t>(header[43]) << 24);

  Serial.printf("Saved file size: %lu bytes\n", static_cast<unsigned long>(actualSize));
  const bool valid = headerBytes == sizeof(header) &&
      memcmp(header, "RIFF", 4) == 0 &&
      memcmp(header + 8, "WAVEfmt ", 8) == 0 &&
      memcmp(header + 36, "data", 4) == 0 &&
      headerRiffSize == expectedAudioBytes + 36 &&
      headerAudioBytes == expectedAudioBytes &&
      actualSize == expectedAudioBytes + 44;

  Serial.println(valid ? "SUCCESS: WAV header and size verified!"
                       : "ERROR: WAV header/size mismatch");
  return valid;
}

static bool recordWav(const char *path) {
  File file = SD.open(path, FILE_WRITE);
  if (!file) {
    Serial.println("ERROR: cannot create WAV file");
    return false;
  }
  if (!writeWavHeader(file, 0)) {
    Serial.println("ERROR: cannot write initial WAV header");
    file.close();
    return false;
  }

  int32_t input[BUFFER_SAMPLES];
  int16_t output[BUFFER_SAMPLES];
  uint32_t recorded = 0;
  uint32_t clipped = 0;
  uint64_t energy = 0;
  bool error = false;

  Serial.println("RECORDING STARTED");
  while (recorded < TOTAL_SAMPLES) {
    size_t bytesRead = 0;
    const esp_err_t err = i2s_read(MIC_I2S_PORT, input, sizeof(input),
                                   &bytesRead, pdMS_TO_TICKS(1500));
    if (err != ESP_OK || bytesRead == 0 || bytesRead % sizeof(int32_t) != 0) {
      Serial.println("ERROR: I2S read failed");
      error = true;
      break;
    }
    size_t samples = bytesRead / sizeof(int32_t);
    const uint32_t remaining = TOTAL_SAMPLES - recorded;
    if (samples > remaining) samples = remaining;

    for (size_t i = 0; i < samples; ++i) {
      const int32_t pcm = input[i] >> 14;
      const int32_t adjusted = static_cast<int32_t>(pcm * AUDIO_GAIN);
      int32_t clamped = adjusted;
      if (clamped > 32767) {
        clamped = 32767;
        ++clipped;
      } else if (clamped < -32768) {
        clamped = -32768;
        ++clipped;
      }
      output[i] = static_cast<int16_t>(clamped);
      const int64_t value = static_cast<int64_t>(clamped);
      energy += static_cast<uint64_t>(value * value);
    }
    const size_t expectedBytes = samples * sizeof(int16_t);
    if (file.write(reinterpret_cast<const uint8_t *>(output), expectedBytes) != expectedBytes) {
      Serial.println("ERROR: microSD write failed");
      error = true;
      break;
    }
    recorded += samples;
  }

  const uint32_t dataBytes = recorded * sizeof(int16_t);
  if (!writeWavHeader(file, dataBytes)) {
    Serial.println("ERROR: WAV header finalization failed");
    error = true;
  }
  file.flush();
  file.close();

  Serial.println("RECORDING FINISHED");
  Serial.printf("File: %s\n", path);
  Serial.printf("Samples recorded: %lu / %lu\n",
                static_cast<unsigned long>(recorded),
                static_cast<unsigned long>(TOTAL_SAMPLES));
  Serial.printf("Audio bytes: %lu\n", static_cast<unsigned long>(dataBytes));
  Serial.printf("Clipped samples: %lu\n", static_cast<unsigned long>(clipped));
  const double rms = recorded ? sqrt(static_cast<double>(energy) / recorded) : 0.0;
  Serial.printf("PCM RMS: %.1f\n", rms);
  if (recorded > 0 && rms < 1.0) {
    Serial.println("WARNING: Audio nearly silent; listen to WAV and check I2S channel");
  }
  if (recorded > 0 && clipped > recorded / 50) {
    Serial.println("WARNING: More than 2% samples clipped; reduce AUDIO_GAIN");
  }

  if (error || recorded != TOTAL_SAMPLES) {
    Serial.println("ERROR: recording incomplete; file kept for inspection");
    return false;
  }
  return verifyWavOnSd(path, dataBytes);
}

namespace {
bool sdReady = false;
bool rtcTrustedThisBoot = false;
bool micReady = false;
bool autoMonitoring = true;
uint32_t remoteRevision = 0;
uint32_t recordingIntervalSeconds = 300;
unsigned long nextScheduledRecordingAt = 0;
unsigned long lastAutoRecordingAt = 0;
unsigned long nextMicRetryAt = 0;
float noiseFloor = 0.008f;
uint16_t baselineFrames = 0;
uint8_t consecutiveActiveFrames = 0;

constexpr uint16_t kMaxPendingWavs = 12;
constexpr unsigned long kFirstScheduledMs = 15000UL;
constexpr unsigned long kScheduledEveryMs = 300000UL;
unsigned long scheduledEveryMs = kScheduledEveryMs;
constexpr unsigned long kAcousticCooldownMs = 30000UL;
constexpr float kAbsoluteRmsThreshold = 0.045f;
constexpr float kNoiseMultiplier = 3.5f;
unsigned long nextUploadAt = 0;
unsigned long nextRemoteAt = 0;
unsigned long nextReconnectAt = 0;
unsigned long nextNtpAt = 0;
constexpr unsigned long kSyncEveryMs = 60000UL;
constexpr unsigned long kReconnectEveryMs = 30000UL;

void captureOneRecording() {
  if (!sdReady) {
    Serial.println("Recording refused: microSD unavailable");
    return;
  }
  if (countListenPending() >= kMaxPendingWavs) {
    Serial.println("Recording paused: pending queue limit reached");
    return;
  }
  const String base = uniqueRecordingBase();
  if (base.isEmpty()) {
    Serial.println("Recording refused: cannot allocate safe unique ID");
    return;
  }
  UtcTime time = {};
  bool stopped = true;
  const bool verified = rtcTrustedThisBoot && rtcReadUtc(time, stopped) && !stopped;
  const String observed = verified ? utcHeader(time) : String();
  if (!verified) Serial.println("Clock unverified; backend observedAt will be null");
  // ID must be stable across retries and survive power loss on microSD.
  ListenQueuedRecording metadata = {};
  metadata.recordingId = "listen-" + base.substring(8); // Strip /LISTEN/.
  metadata.observedAtUtc = observed;
  metadata.rtcVerified = verified;
  metadata.durationMs = RECORD_SECONDS * 1000;

  const String temporary = base + ".PART";
  Serial.printf("Recording %s (%lu seconds)\n", metadata.recordingId.c_str(),
                static_cast<unsigned long>(RECORD_SECONDS));
  if (!micReady) {
    micReady = startMicrophone();
    if (!micReady) return;
  }
  const bool recorded = recordWav(temporary.c_str());
  // Keep I2S installed for automatic monitoring.
  if (!recorded) {
    Serial.println("Recording incomplete: retained PART for manual inspection");
    return;
  }
  if (!inspectListenWav(temporary, metadata.sha256, metadata.audioBytes)) {
    Serial.println("SHA-256 calculation failed; retained PART without queueing");
    return;
  }
  if (!enqueueListenRecording(base, metadata)) {
    Serial.println("Queue finalization interrupted; retained local evidence");
    return;
  }
  Serial.printf("Queued WAV, bytes=%lu, SHA256=%s\n",
                static_cast<unsigned long>(metadata.audioBytes),
                metadata.sha256.c_str());
  Serial.printf("Pending queue count: %u\n", countListenPending());
  nextUploadAt = millis();
}

// Energy-based acoustic activity detector.
// This is NOT species recognition or a validated wildlife VAD.
void monitorAcoustics() {
  if (!autoMonitoring || !sdReady) return;

  if (!micReady) {
    const unsigned long now = millis();
    if (static_cast<int32_t>(now - nextMicRetryAt) < 0) return;
    nextMicRetryAt = now + 10000UL;
    micReady = startMicrophone();
    if (!micReady) return;
  }

  int32_t raw[BUFFER_SAMPLES] = {};
  size_t bytesRead = 0;
  const esp_err_t result = i2s_read(
      MIC_I2S_PORT, raw, sizeof(raw),
      &bytesRead, pdMS_TO_TICKS(80));

  if (result != ESP_OK || bytesRead < sizeof(int32_t) ||
      bytesRead % sizeof(int32_t) != 0) {
    return;
  }

  const size_t samples = bytesRead / sizeof(int32_t);
  double energy = 0.0;

  for (size_t i = 0; i < samples; ++i) {
    const float sample =
        (static_cast<float>(raw[i] >> 14) * AUDIO_GAIN) / 32768.0f;
    energy += static_cast<double>(sample) * sample;
  }

  const float rms = static_cast<float>(sqrt(energy / samples));

  // Initial ambient-noise calibration.
  if (baselineFrames < 50) {
    noiseFloor = 0.95f * noiseFloor + 0.05f * rms;
    ++baselineFrames;
    return;
  }

  const float threshold =
      fmaxf(kAbsoluteRmsThreshold, noiseFloor * kNoiseMultiplier);
  const bool active = rms >= threshold;

  if (active) {
    if (consecutiveActiveFrames < 10) {
      ++consecutiveActiveFrames;
    }
  } else {
    consecutiveActiveFrames = 0;
    noiseFloor = 0.995f * noiseFloor + 0.005f * rms;
  }

  const unsigned long now = millis();

  // Scheduled reference recording, even without a loud trigger.
  if (static_cast<int32_t>(now - nextScheduledRecordingAt) >= 0) {
    if (countListenPending() < kMaxPendingWavs) {
      Serial.println("AUTO: scheduled acoustic reference recording");
      lastAutoRecordingAt = now;
      captureOneRecording();
    }
    nextScheduledRecordingAt = millis() + scheduledEveryMs;
    consecutiveActiveFrames = 0;
    return;
  }

  // Several consecutive active frames prevent single-spike triggers.
  if (consecutiveActiveFrames >= 4 &&
      (now - lastAutoRecordingAt) >= kAcousticCooldownMs) {
    consecutiveActiveFrames = 0;

    if (countListenPending() < kMaxPendingWavs) {
      Serial.printf(
          "AUTO: acoustic activity, RMS=%.4f threshold=%.4f\\n",
          rms, threshold);
      lastAutoRecordingAt = now;
      captureOneRecording();
      nextScheduledRecordingAt = millis() + scheduledEveryMs;
    }
  }
}

// Polling is outbound over verified HTTPS. Commands are durable and idempotent.
// NVS revision is written last; a failed ACK will be retried without reapplying.
void checkRemoteCommands() {
  ListenRemoteCommand cmd;
  if (!listenPollRemote(cmd, autoMonitoring, recordingIntervalSeconds) || !cmd.pending) return;
  if (cmd.revision > remoteRevision) {
    bool nextMonitoring = autoMonitoring;
    if (cmd.action == "start") nextMonitoring = true;
    if (cmd.action == "pause") nextMonitoring = false;
    Preferences prefs;
    if (!prefs.begin("listen-rec", false)) return;
    // Save the desired settings BEFORE committing the remote command revision.
    const bool saved = prefs.putBool("auto", nextMonitoring) > 0 &&
        prefs.putUInt("every", cmd.intervalSeconds) > 0 &&
        prefs.putUInt("remoteRev", cmd.revision) > 0;
    prefs.end();
    if (!saved) {
      Serial.println("Remote: NVS write failed; command not acknowledged");
      return;
    }
    const bool wasOn = autoMonitoring;
    const uint32_t previousInterval = recordingIntervalSeconds;
    autoMonitoring = nextMonitoring;
    recordingIntervalSeconds = cmd.intervalSeconds;
    scheduledEveryMs = static_cast<unsigned long>(recordingIntervalSeconds) * 1000UL;
    remoteRevision = cmd.revision;
    consecutiveActiveFrames = 0;
    if ((autoMonitoring && !wasOn) || previousInterval != recordingIntervalSeconds) {
      baselineFrames = 0;
      lastAutoRecordingAt = millis();
      nextScheduledRecordingAt = millis() + (autoMonitoring ? kFirstScheduledMs : scheduledEveryMs);
    }
    Serial.printf("Remote applied rev=%lu action=%s auto=%s interval=%lu sec\n",
      static_cast<unsigned long>(remoteRevision), cmd.action.c_str(),
      autoMonitoring ? "ON" : "OFF",
      static_cast<unsigned long>(recordingIntervalSeconds));
  }
  if (cmd.revision == remoteRevision) {
    listenAckRemote(remoteRevision, autoMonitoring, recordingIntervalSeconds);
  }
}

void showStatus() {
  Serial.printf(
      "AUTO monitoring: %s | I2S: %s | noise floor: %.4f\\n",
      autoMonitoring ? "ON" : "OFF",
      micReady ? "ready" : "offline",
      noiseFloor);
  Serial.printf("WiFi: %s | UTC/NTP verified boot: %s | queue: %u\n",
                WiFi.status() == WL_CONNECTED ? "connected" : "offline",
                rtcTrustedThisBoot ? "yes" : "no", sdReady ? countListenPending() : 0);
  Serial.printf("Remote interval: %lu sec | last applied rev: %lu\n",
    static_cast<unsigned long>(recordingIntervalSeconds),
    static_cast<unsigned long>(remoteRevision));
  Serial.printf("HTTPS device credentials configured: %s\n",
                listenSyncConfigured() ? "yes" : "no");
  UtcTime time = {};
  bool osf = true;
  if (rtcReadUtc(time, osf)) {
    printRtcTime(time);
    Serial.printf("RTC oscillator-stop flag: %d\n", osf ? 1 : 0);
  } else {
    Serial.println("RTC time not readable");
  }
}
} // namespace

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println("AUVRION BIOSPHERE | LISTEN device sync");

  Preferences settings;
  if (settings.begin("listen-rec", false)) {
    // A remote revision belongs to exactly one provisioned device.
    // A previous localhost device can have rev=33 while the production
    // device starts at rev=1. Bind NVS to the device ID, never to the token.
    // Write the device ID last: a reset/power loss before this point makes
    // migration retry on the next boot, avoiding a stale revision ACK.
    if (settings.getString("deviceId", "") != String(LISTEN_DEVICE_ID)) {
      const bool cleared =
          settings.putBool("auto", false) > 0 &&
          settings.putUInt("every", 300) > 0 &&
          settings.putUInt("remoteRev", 0) > 0;
      if (cleared && settings.putString("deviceId", LISTEN_DEVICE_ID) > 0) {
        Serial.println("Remote: device binding updated; stale revision reset to 0");
      } else {
        Serial.println("ERROR: remote NVS device binding could not be saved");
      }
    }
    // Safe fallback OFF even if a new NVS namespace has no setting.
    autoMonitoring = settings.getBool("auto", false);
    remoteRevision = settings.getUInt("remoteRev", 0);
    const uint32_t interval = settings.getUInt("every", 300);
    if (interval == 60 || interval == 300 || interval == 900) {
      recordingIntervalSeconds = interval;
      scheduledEveryMs = static_cast<unsigned long>(interval) * 1000UL;
    }
    settings.end();
  } else {
    Serial.println("ERROR: remote NVS unavailable; monitoring remains OFF");
    autoMonitoring = false;
    remoteRevision = 0;
  }
  Serial.println("Serial commands: r=record, u=upload, s=status, a=toggle auto");
  Wire.begin(RTC_SDA, RTC_SCL);
  Wire.setClock(100000);
  // NTP establishes the UTC system clock needed for TLS cert validation.
  rtcTrustedThisBoot = syncRtcFromNtp();
  if (!rtcTrustedThisBoot) {
    Serial.println("NTP unavailable: offline WAV recording still allowed (unverified time)");
  }
  SPI.begin(SD_SCK, SD_MISO, SD_MOSI, SD_CS);
  sdReady = SD.begin(SD_CS, SPI, SD_SPI_HZ) && SD.cardType() != CARD_NONE;
  if (!sdReady || (!SD.exists("/LISTEN") && !SD.mkdir("/LISTEN"))) {
    sdReady = false;
    Serial.println("microSD mount or /LISTEN directory failed");
  } else {
    recoverListenQueue();
    micReady = startMicrophone();
    if (!micReady) {
      Serial.println("WARNING: I2S unavailable; auto will retry");
    }
  }
  lastAutoRecordingAt = millis();
  nextScheduledRecordingAt = millis() + kFirstScheduledMs;
  showStatus();
  nextUploadAt = millis() + 5000UL;
  nextRemoteAt = millis() + 2000UL;
  nextReconnectAt = millis() + kReconnectEveryMs;
  nextNtpAt = millis() + kReconnectEveryMs;
}

void loop() {
  if (Serial.available()) {
    const char command = static_cast<char>(Serial.read());
    if (command == 'r' || command == 'R') captureOneRecording();
    else if (command == 'u' || command == 'U') {
      if (sdReady) syncListenPending(3);
    } else if (command == 's' || command == 'S') showStatus();
    else if (command == '1' || command == '0') {
      autoMonitoring = command == '1';
      consecutiveActiveFrames = 0;

      if (autoMonitoring) {
        baselineFrames = 0;
        lastAutoRecordingAt = millis();
        nextScheduledRecordingAt = millis() + kFirstScheduledMs;
      }

      Preferences settings;
      if (settings.begin("listen-rec", false)) {
        settings.putBool("auto", autoMonitoring);
        settings.end();
      }
      showStatus();
    }
    else if (command == 'a' || command == 'A') {
      autoMonitoring = !autoMonitoring;
      Preferences settings;
      if (settings.begin("listen-rec", false)) {
        settings.putBool("auto", autoMonitoring);
        settings.end();
      }
      consecutiveActiveFrames = 0;
      if (autoMonitoring) {
        baselineFrames = 0;
        nextScheduledRecordingAt = millis() + kFirstScheduledMs;
      }
      showStatus();
    }
  }
  const unsigned long now = millis();
  if (static_cast<int32_t>(now - nextReconnectAt) >= 0) {
    nextReconnectAt = now + kReconnectEveryMs;
    if (WiFi.status() != WL_CONNECTED) {
      WiFi.mode(WIFI_STA);
      WiFi.reconnect();
    }
  }
  if (!rtcTrustedThisBoot && WiFi.status() == WL_CONNECTED &&
      static_cast<int32_t>(now - nextNtpAt) >= 0) {
    nextNtpAt = now + kReconnectEveryMs;
    rtcTrustedThisBoot = syncRtcFromNtp();
  }
  if (static_cast<int32_t>(now - nextRemoteAt) >= 0) {
    nextRemoteAt = millis() + 15000UL;
    checkRemoteCommands();
  }
  if (sdReady && static_cast<int32_t>(now - nextUploadAt) >= 0) {
    nextUploadAt = now + kSyncEveryMs;
    if (WiFi.status() == WL_CONNECTED && rtcTrustedThisBoot) syncListenPending(3);
  }
  monitorAcoustics();
  delay(20);
}
