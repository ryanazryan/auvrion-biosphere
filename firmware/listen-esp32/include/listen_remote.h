#pragma once
#include <Arduino.h>

struct ListenRemoteCommand {
  bool pending = false;
  uint32_t revision = 0;
  uint32_t intervalSeconds = 300;
  String action;
};

// Device must have NTP time and Wi-Fi; same trusted URL & CA as WAV ingestion.
bool listenPollRemote(ListenRemoteCommand &out, bool monitoring, uint32_t intervalSeconds);
bool listenAckRemote(uint32_t revision, bool monitoring, uint32_t intervalSeconds);
