"use client";

import { useId } from "react";

/** Illustrative only; no claim about enclosure, measured signals or installed hardware. */
export function ListenDeviceIllustration() {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 380 245"
      className="h-auto w-full max-w-[335px]"
      role="img"
      aria-label="Ilustrasi konsep isometrik kotak ESP32 LISTEN dengan mikrofon dan antena"
    >
      <title>Konsep perangkat Auvrion LISTEN</title>
      <defs>
        <linearGradient id={`${id}-top`} x1="0" x2="1" y1="0" y2="1">
          <stop stopColor="#ffffff" />
          <stop offset="1" stopColor="#dbe8e2" />
        </linearGradient>
        <linearGradient id={`${id}-side`} x1="0" x2="0" y1="0" y2="1">
          <stop stopColor="#b2c7bd" />
          <stop offset="1" stopColor="#849e90" />
        </linearGradient>
        <linearGradient id={`${id}-mic`} x1="0" x2="1" y1="0" y2="1">
          <stop stopColor="#36403c" />
          <stop offset="1" stopColor="#121b18" />
        </linearGradient>
      </defs>
      <ellipse
        cx="189"
        cy="213"
        rx="122"
        ry="17"
        fill="#416753"
        opacity=".09"
      />
      <path
        d="m78 116 149-59 94 51-143 60Z"
        fill={`url(#${id}-top)`}
        stroke="#a1b8ac"
        strokeWidth="1.7"
      />
      <path
        d="m78 116 100 52v44l-100-53Z"
        fill={`url(#${id}-side)`}
        stroke="#88a397"
        strokeWidth="1.5"
      />
      <path
        d="m178 168 143-60v45l-143 59Z"
        fill="#b6cbc1"
        stroke="#8ba69a"
        strokeWidth="1.5"
      />
      <path d="m96 119 129-51 77 41-126 54Z" fill="#f8fcf9" stroke="#d1ded6" />
      <path d="m127 114 65-26 43 20-64 28Z" fill="#e3f1e9" stroke="#b4d0bd" />
      <path d="m152 105 28-11 20 9-28 12Z" fill="#24795e" opacity=".87" />
      <path
        d="M246 80V31"
        stroke="#203a2e"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path
        d="M246 80V31"
        stroke="#769484"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M132 122V79"
        stroke="#26362f"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <rect
        x="112"
        y="32"
        width="40"
        height="53"
        rx="20"
        fill={`url(#${id}-mic)`}
        stroke="#73867b"
        strokeWidth="1.4"
      />
      <g fill="#829b8d" opacity=".6">
        <circle cx="123" cy="45" r="1" />
        <circle cx="132" cy="45" r="1" />
        <circle cx="141" cy="45" r="1" />
        <circle cx="123" cy="55" r="1" />
        <circle cx="132" cy="55" r="1" />
        <circle cx="141" cy="55" r="1" />
        <circle cx="123" cy="65" r="1" />
        <circle cx="132" cy="65" r="1" />
        <circle cx="141" cy="65" r="1" />
      </g>
      <g fill="#708d7d">
        <circle cx="96" cy="116" r="3.4" />
        <circle cx="300" cy="110" r="3.4" />
        <circle cx="177" cy="159" r="3.4" />
        <circle cx="227" cy="71" r="3.4" />
      </g>
      <path
        d="m202 180 46-19M205 188l29-12"
        stroke="#367459"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="m100 145 26 13v14l-26-13ZM273 167l20-8v17l-20 8Z"
        fill="#4c6859"
      />
      <circle cx="295" cy="143" r="4" fill="#318b61" />
    </svg>
  );
}

/** Concept-only rendering; PREVENT physical prototype is not built. */
export function PreventDeviceIllustration() {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 380 245"
      className="h-auto w-full max-w-[335px]"
      role="img"
      aria-label="Ilustrasi konsep isometrik PREVENT berupa sensor udara dengan pelindung radiasi dan boks kontrol"
    >
      <title>
        Ilustrasi rencana perangkat Auvrion PREVENT yang belum dirakit
      </title>
      <defs>
        <linearGradient id={`${id}-case`} x1="0" x2="1" y1="0" y2="1">
          <stop stopColor="#fcfdfb" />
          <stop offset="1" stopColor="#d6e0db" />
        </linearGradient>
        <linearGradient id={`${id}-lid`} x1="0" x2="0" y1="0" y2="1">
          <stop stopColor="#fbfdfb" />
          <stop offset="1" stopColor="#c0d0c6" />
        </linearGradient>
        <linearGradient id={`${id}-pole`} x1="0" x2="1" y1="0" y2="0">
          <stop stopColor="#8b9892" />
          <stop offset=".55" stopColor="#dce4df" />
          <stop offset="1" stopColor="#72857a" />
        </linearGradient>
      </defs>
      <ellipse cx="185" cy="220" rx="95" ry="15" fill="#647a6a" opacity=".1" />
      <path
        d="M196 47v173"
        stroke={`url(#${id}-pole)`}
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="m138 62 65 8 55-12-66-9Z"
        fill={`url(#${id}-lid)`}
        stroke="#bbc9c0"
      />
      <path
        d="m136 80 67 8 58-13-67-8Z"
        fill={`url(#${id}-lid)`}
        stroke="#bbc9c0"
      />
      <path
        d="m139 96 64 9 56-13-65-9Z"
        fill={`url(#${id}-lid)`}
        stroke="#bbc9c0"
      />
      <path
        d="m141 111 61 9 55-13-63-9Z"
        fill={`url(#${id}-lid)`}
        stroke="#bbc9c0"
      />
      <path
        d="m143 126 60 8 51-13-61-8Z"
        fill={`url(#${id}-lid)`}
        stroke="#bbc9c0"
      />
      <path d="m153 138 49 7 44-11-49-7Z" fill="#d0dfd6" stroke="#aabdaf" />
      <path
        d="m135 151 64-16 68 28-64 19Z"
        fill={`url(#${id}-case)`}
        stroke="#a8beb0"
        strokeWidth="1.7"
      />
      <path
        d="m135 151 68 31v47l-68-32Z"
        fill="#d8e5dc"
        stroke="#a2b5a9"
        strokeWidth="1.5"
      />
      <path
        d="m203 182 64-19v44l-64 22Z"
        fill="#a5bdae"
        stroke="#90aa9a"
        strokeWidth="1.5"
      />
      <path d="m151 170 35 16v27l-35-17Z" fill="#f3f8f4" stroke="#b6cbbd" />
      <circle cx="175" cy="190" r="3.3" fill="#3c896b" />
      <path
        d="m224 190 23-7m-23 14 23-7m-23 14 16-5"
        stroke="#577765"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M270 178c19 4 20 22 22 36"
        stroke="#3e6152"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="138" cy="152" r="2.5" fill="#748e7d" />
      <circle cx="266" cy="162" r="2.5" fill="#748e7d" />
    </svg>
  );
}
