import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export function GET(req: NextRequest) {
  const s = Number(req.nextUrl.searchParams.get("size")) || 512;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0A0A0A",
        }}
      >
        <div
          style={{
            position: "relative",
            display: "flex",
            width: s * 0.52,
            height: s * 0.4,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: s * 0.28,
              height: s * 0.12,
              background: "#FFFFFF",
              borderRadius: s * 0.03,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              top: s * 0.07,
              width: s * 0.52,
              height: s * 0.33,
              background: "#FFFFFF",
              borderRadius: s * 0.04,
            }}
          />
        </div>
      </div>
    ),
    { width: s, height: s },
  );
}
