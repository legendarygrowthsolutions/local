import { describe, expect, it } from "vitest";
import { bookingCodeFromQr } from "./use-qr-camera";

describe("bookingCodeFromQr", () => {
  it("reads ticket QR payloads and bare codes", () => {
    expect(bookingCodeFromQr("LOCAL:LCL7Q2KX")).toBe("LCL7Q2KX");
    expect(bookingCodeFromQr("local:lclt82hv4")).toBe("LCLT82HV4");
    expect(bookingCodeFromQr("  LCS05O1S ")).toBe("LCS05O1S");
  });
  it("rejects anything else", () => {
    for (const v of ["https://evil.example/LCL7Q2KX", "LOCAL:", "hello", "LOCAL:LCL7Q2KX;drop", ""]) expect(bookingCodeFromQr(v)).toBeNull();
  });
});
