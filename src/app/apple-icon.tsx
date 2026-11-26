import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// iPhone home-screen icon, drawn from the same SVG as the browser tab icon.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const svg = readFileSync(join(process.cwd(), "src/app/icon.svg"), "utf8")
  // iOS rounds the corners itself, so fill the whole square.
  .replace('rx="14"', 'rx="0"');
const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

export default function AppleIcon() {
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain <img>
    <img src={src} width={size.width} height={size.height} alt="" />,
    size,
  );
}
