import { describe, expect, it } from "vitest";
import { classifyCopilotQuestion, EXACT_UUID } from "./decision";

const id = "bec0bcd5-3535-4a8d-87fa-c88d8dd149a4";
describe("WC024 trusted routing without database bypass", () => {
  it("recognizes a valid observation ID embedded in the question", () => {
    expect(EXACT_UUID.test(id)).toBe(true);
    expect(
      classifyCopilotQuestion(`Jelaskan observasi ${id}`, "overview"),
    ).toMatchObject({ observationId: id, mode: "observation" });
  });
  it("does not invent an observation without a UUID", () => {
    expect(
      classifyCopilotQuestion("Jelaskan observasi ini", "observation")
        .observationId,
    ).toBeNull();
  });
  it("routes a weather question to environment instead of pretending it is LISTEN", () => {
    expect(classifyCopilotQuestion("cuaca Bali", "overview").mode).toBe(
      "environment",
    );
  });
  it("requires an explicit prefix before requesting species enrichment", () => {
    expect(
      classifyCopilotQuestion("referensi spesies: Pongo pygmaeus", "listen")
        .speciesName,
    ).toBe("Pongo pygmaeus");
    expect(
      classifyCopilotQuestion("Saya dengar orangutan", "listen").speciesName,
    ).toBeNull();
  });
});
