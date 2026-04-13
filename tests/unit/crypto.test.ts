import { describe, it, expect, vi } from "vitest";

// vi.mock is hoisted — factory must not reference outer variables
vi.mock("~/env", () => ({
  env: {
    ENCRYPTION_KEY: require("crypto").randomBytes(32).toString("hex"),
  },
}));

import { encrypt, decrypt } from "~/lib/crypto";

describe("encrypt / decrypt", () => {
  it("round-trips a simple string", () => {
    const plaintext = "my-secret-password";
    const ciphertext = encrypt(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it("round-trips an empty string", () => {
    const ciphertext = encrypt("");
    expect(decrypt(ciphertext)).toBe("");
  });

  it("round-trips unicode content", () => {
    const plaintext = "pässwörd-🔑-密码";
    const ciphertext = encrypt(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it("produces different ciphertexts for the same input (random IV)", () => {
    const plaintext = "same-input";
    const a = encrypt(plaintext);
    const b = encrypt(plaintext);
    expect(a).not.toBe(b);
    // But both decrypt to the same value
    expect(decrypt(a)).toBe(plaintext);
    expect(decrypt(b)).toBe(plaintext);
  });

  it("throws on tampered ciphertext", () => {
    const ciphertext = encrypt("test");
    const parts = ciphertext.split(":");
    // Flip a character in the encrypted data
    parts[2] = "ff" + parts[2]!.slice(2);
    const tampered = parts.join(":");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws on invalid format", () => {
    expect(() => decrypt("not-valid")).toThrow("Invalid ciphertext format");
  });
});
