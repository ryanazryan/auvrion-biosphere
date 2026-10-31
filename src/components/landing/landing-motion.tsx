"use client";

import { useEffect } from "react";

/** One shared observer; compositor-only CSS transitions. Reduced-motion is respected. */
export function LandingMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".ab-landing");
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    if (!("IntersectionObserver" in window)) return;
    const elements = Array.from(
      root.querySelectorAll<HTMLElement>("[data-reveal]"),
    );
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).classList.add("ab-in-view");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.07, rootMargin: "0px 0px -25px 0px" },
    );
    for (const element of elements) observer.observe(element);
    // Enable transitions only after all target nodes are registered, avoiding no-JS hidden content.
    root.classList.add("ab-motion-ready");
    return () => {
      observer.disconnect();
      root.classList.remove("ab-motion-ready");
    };
  }, []);
  return null;
}
