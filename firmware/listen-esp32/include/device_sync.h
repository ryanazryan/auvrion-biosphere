#pragma once

#include <Arduino.h>

// Only metadata is persisted in .META; credentials are never written to microSD.
struct ListenQueuedRecording {
  String recordingId;
  String observedAtUtc; // Empty string means no verified timestamp.
  bool rtcVerified;
  String sha256;
  uint32_t audioBytes;
  uint32_t durationMs;
};

bool inspectListenWav(const String &path, String &sha256, uint32_t &bytes);
bool enqueueListenRecording(const String &basePath, const ListenQueuedRecording &metadata);
void recoverListenQueue();
uint16_t countListenPending();
void syncListenPending(uint8_t maxFiles = 3);

// Call only after NTP sets the system clock and with a valid Wi-Fi connection.
bool listenSyncConfigured();
