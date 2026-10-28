#include <Arduino.h>
#include <WiFi.h>
#include <Wire.h>
#include <time.h>

#include "listen_secrets.h"

#define RTC_ADDRESS 0x68
#define RTC_SDA 21
#define RTC_SCL 22

const char* NTP_SERVER_1 = "pool.ntp.org";
const char* NTP_SERVER_2 = "time.google.com";

uint8_t toBCD(int n) {
  return (n / 10) * 16 + (n % 10);
}

uint8_t fromBCD(uint8_t n) {
  return (n >> 4) * 10 + (n & 0x0F);
}

bool syncRTC() {
  Serial.println("Connecting to WiFi...");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();

  while (WiFi.status() != WL_CONNECTED &&
         millis() - start < 20000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\nERROR: WiFi connection failed");
    return false;
  }

  Serial.println("\nSUCCESS: WiFi connected!");

  // Simpan waktu UTC di RTC, bukan WITA.
  configTime(0, 0, NTP_SERVER_1, NTP_SERVER_2);

  Serial.println("Waiting for NTP synchronization...");

  struct tm utc = {};

  if (!getLocalTime(&utc, 15000) ||
      utc.tm_year + 1900 < 2025) {
    Serial.println("ERROR: NTP synchronization failed");
    return false;
  }

  Serial.println("SUCCESS: NTP time received!");

  Wire.beginTransmission(RTC_ADDRESS);
  Wire.write(0x00);

  Wire.write(toBCD(utc.tm_sec));
  Wire.write(toBCD(utc.tm_min));
  Wire.write(toBCD(utc.tm_hour));
  Wire.write(toBCD(utc.tm_wday + 1));
  Wire.write(toBCD(utc.tm_mday));
  Wire.write(toBCD(utc.tm_mon + 1));
  Wire.write(toBCD((utc.tm_year + 1900) - 2000));

  if (Wire.endTransmission() != 0) {
    Serial.println("ERROR: Cannot set DS3231");
    return false;
  }

  // Baca status RTC untuk membersihkan OSF.
  Wire.beginTransmission(RTC_ADDRESS);
  Wire.write(0x0F);

  if (Wire.endTransmission() != 0 ||
      Wire.requestFrom(RTC_ADDRESS, 1) != 1) {
    Serial.println("ERROR: Cannot read RTC status");
    return false;
  }

  uint8_t status = Wire.read();

  Wire.beginTransmission(RTC_ADDRESS);
  Wire.write(0x0F);
  Wire.write(status & 0x7F);

  if (Wire.endTransmission() != 0) {
    Serial.println("ERROR: Cannot clear RTC OSF");
    return false;
  }

  Serial.println("SUCCESS: RTC synchronized with NTP!");
  return true;
}

void printRTC() {
  Wire.beginTransmission(RTC_ADDRESS);
  Wire.write(0x00);

  if (Wire.endTransmission() != 0 ||
      Wire.requestFrom(RTC_ADDRESS, 7) != 7) {
    Serial.println("ERROR: RTC read failed");
    return;
  }

  int ss = fromBCD(Wire.read() & 0x7F);
  int mm = fromBCD(Wire.read() & 0x7F);
  int hh = fromBCD(Wire.read() & 0x3F);
  Wire.read(); // Weekday
  int day = fromBCD(Wire.read() & 0x3F);
  uint8_t monthReg = Wire.read();
  int month = fromBCD(monthReg & 0x1F);
  int year = 2000 + fromBCD(Wire.read());

  if (monthReg & 0x80) {
    year += 100;
  }

  Serial.printf(
    "RTC UTC: %04d-%02d-%02d %02d:%02d:%02d\n",
    year, month, day, hh, mm, ss
  );

  Wire.beginTransmission(RTC_ADDRESS);
  Wire.write(0x0F);

  if (Wire.endTransmission() == 0 &&
      Wire.requestFrom(RTC_ADDRESS, 1) == 1) {
    uint8_t status = Wire.read();
    Serial.printf(
      "RTC OSF: %d\n",
      (status & 0x80) ? 1 : 0
    );
  }
}

void setup() {
  Serial.begin(115200);
  delay(1500);

  Wire.begin(RTC_SDA, RTC_SCL);
  Wire.setClock(100000);

  Serial.println();
  Serial.println("AUVRION BIOSPHERE - LISTEN");
  Serial.println("Automatic RTC NTP Synchronization");

  if (syncRTC()) {
    Serial.println("RTC ready for timestamping!");
  } else {
    Serial.println("RTC NOT synchronized.");
    Serial.println("Do not trust RTC timestamps yet.");
  }
}

void loop() {
  printRTC();
  delay(2000);
}
