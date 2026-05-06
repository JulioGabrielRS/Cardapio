const fs = require("fs/promises");
const path = require("path");

const width = 1600;
const height = 960;
const outputDir = path.join(__dirname, "..", "public", "assets");
const outputPath = path.join(outputDir, "hero-sushi.bmp");

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function color(r, g, b) {
  return { r, g, b };
}

function lerpColor(a, b, t) {
  return color(
    Math.round(mix(a.r, b.r, t)),
    Math.round(mix(a.g, b.g, t)),
    Math.round(mix(a.b, b.b, t))
  );
}

function drawPixel(buffer, x, y, fill) {
  if (x < 0 || x >= width || y < 0 || y >= height) {
    return;
  }
  const index = (y * width + x) * 3;
  buffer[index] = fill.b;
  buffer[index + 1] = fill.g;
  buffer[index + 2] = fill.r;
}

function fillRect(buffer, left, top, rectWidth, rectHeight, fill) {
  for (let y = top; y < top + rectHeight; y += 1) {
    for (let x = left; x < left + rectWidth; x += 1) {
      drawPixel(buffer, x, y, fill);
    }
  }
}

function fillCircle(buffer, centerX, centerY, radius, fill) {
  const radiusSq = radius * radius;
  for (let y = Math.floor(centerY - radius); y <= Math.ceil(centerY + radius); y += 1) {
    for (let x = Math.floor(centerX - radius); x <= Math.ceil(centerX + radius); x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;
      if (dx * dx + dy * dy <= radiusSq) {
        drawPixel(buffer, x, y, fill);
      }
    }
  }
}

function fillEllipse(buffer, centerX, centerY, radiusX, radiusY, fill) {
  for (let y = Math.floor(centerY - radiusY); y <= Math.ceil(centerY + radiusY); y += 1) {
    for (let x = Math.floor(centerX - radiusX); x <= Math.ceil(centerX + radiusX); x += 1) {
      const dx = (x - centerX) / radiusX;
      const dy = (y - centerY) / radiusY;
      if (dx * dx + dy * dy <= 1) {
        drawPixel(buffer, x, y, fill);
      }
    }
  }
}

function fillRotatedRect(buffer, centerX, centerY, rectWidth, rectHeight, angle, fill) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const halfW = rectWidth / 2;
  const halfH = rectHeight / 2;

  for (let y = Math.floor(centerY - rectHeight); y <= Math.ceil(centerY + rectHeight); y += 1) {
    for (let x = Math.floor(centerX - rectWidth); x <= Math.ceil(centerX + rectWidth); x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;
      const localX = dx * cos + dy * sin;
      const localY = -dx * sin + dy * cos;
      if (Math.abs(localX) <= halfW && Math.abs(localY) <= halfH) {
        drawPixel(buffer, x, y, fill);
      }
    }
  }
}

function background(buffer) {
  const top = color(254, 248, 238);
  const bottom = color(237, 224, 204);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const vertical = y / (height - 1);
      const diagonal = (x + y) / (width + height);
      const tone = clamp(vertical * 0.82 + diagonal * 0.18, 0, 1);
      const base = lerpColor(top, bottom, tone);
      drawPixel(buffer, x, y, base);
    }
  }
}

function shadow(buffer, centerX, centerY, radiusX, radiusY, alpha) {
  for (let y = Math.floor(centerY - radiusY); y <= Math.ceil(centerY + radiusY); y += 1) {
    for (let x = Math.floor(centerX - radiusX); x <= Math.ceil(centerX + radiusX); x += 1) {
      const dx = (x - centerX) / radiusX;
      const dy = (y - centerY) / radiusY;
      const distance = dx * dx + dy * dy;
      if (distance <= 1) {
        const strength = (1 - distance) * alpha;
        const index = (y * width + x) * 3;
        buffer[index] = Math.round(buffer[index] * (1 - strength));
        buffer[index + 1] = Math.round(buffer[index + 1] * (1 - strength));
        buffer[index + 2] = Math.round(buffer[index + 2] * (1 - strength));
      }
    }
  }
}

function plate(buffer) {
  shadow(buffer, 830, 500, 430, 260, 0.18);
  fillEllipse(buffer, 830, 470, 430, 250, color(37, 43, 39));
  fillEllipse(buffer, 830, 470, 386, 222, color(251, 248, 242));
  fillEllipse(buffer, 830, 470, 330, 188, color(243, 234, 222));
}

function riceMound(buffer, x, y, angle = 0) {
  fillRotatedRect(buffer, x, y, 104, 52, angle, color(248, 246, 240));
  fillEllipse(buffer, x - 14, y - 2, 38, 28, color(255, 252, 248));
  fillEllipse(buffer, x + 18, y + 4, 34, 24, color(241, 238, 232));
}

function salmonSlice(buffer, x, y, angle = 0) {
  fillRotatedRect(buffer, x, y, 110, 32, angle, color(236, 121, 92));
  fillRotatedRect(buffer, x, y - 3, 112, 8, angle, color(248, 175, 153));
  fillRotatedRect(buffer, x, y + 6, 112, 6, angle, color(247, 161, 133));
}

function tunaSlice(buffer, x, y, angle = 0) {
  fillRotatedRect(buffer, x, y, 112, 28, angle, color(175, 54, 60));
  fillRotatedRect(buffer, x, y - 2, 110, 7, angle, color(207, 96, 100));
}

function avocado(buffer, x, y, angle = 0) {
  fillRotatedRect(buffer, x, y, 110, 18, angle, color(84, 140, 86));
  fillRotatedRect(buffer, x, y, 110, 8, angle, color(126, 180, 112));
}

function nigiri(buffer, x, y, fish = "salmon", angle = 0) {
  riceMound(buffer, x, y, angle);
  if (fish === "tuna") {
    tunaSlice(buffer, x, y - 10, angle);
  } else {
    salmonSlice(buffer, x, y - 10, angle);
  }
}

function roll(buffer, x, y, topping) {
  fillCircle(buffer, x, y, 36, color(20, 27, 24));
  fillCircle(buffer, x, y, 28, color(250, 247, 242));
  fillCircle(buffer, x, y, 18, topping);
}

function hotRoll(buffer, x, y) {
  fillCircle(buffer, x, y, 40, color(200, 158, 96));
  fillCircle(buffer, x, y, 32, color(241, 214, 156));
  fillCircle(buffer, x, y, 19, color(243, 247, 239));
  fillCircle(buffer, x, y, 12, color(236, 126, 100));
}

function wasabi(buffer, x, y) {
  fillCircle(buffer, x, y, 24, color(101, 155, 75));
  fillCircle(buffer, x - 4, y - 6, 18, color(131, 188, 94));
}

function ginger(buffer, x, y) {
  fillEllipse(buffer, x, y, 32, 20, color(246, 205, 190));
  fillEllipse(buffer, x + 10, y - 8, 18, 10, color(249, 224, 210));
  fillEllipse(buffer, x - 12, y + 5, 18, 10, color(236, 184, 168));
}

function drizzle(buffer, centerX, centerY, radiusX, radiusY, fill) {
  for (let i = 0; i < 220; i += 1) {
    const angle = (Math.PI * 2 * i) / 220;
    const x = centerX + Math.cos(angle) * radiusX * 0.9;
    const y = centerY + Math.sin(angle) * radiusY * 0.9;
    fillCircle(buffer, x, y, 4, fill);
  }
}

function chopsticks(buffer) {
  fillRotatedRect(buffer, 1230, 250, 460, 12, -0.56, color(129, 85, 48));
  fillRotatedRect(buffer, 1258, 286, 460, 12, -0.56, color(159, 105, 60));
  fillCircle(buffer, 1048, 360, 9, color(112, 64, 35));
  fillCircle(buffer, 1076, 396, 9, color(129, 85, 48));
}

function garnish(buffer) {
  fillCircle(buffer, 1120, 710, 58, color(36, 51, 44));
  fillCircle(buffer, 1120, 710, 48, color(59, 104, 76));
  fillEllipse(buffer, 1120, 710, 26, 18, color(249, 247, 242));
}

function paintDish(buffer) {
  nigiri(buffer, 650, 405, "salmon", -0.18);
  nigiri(buffer, 760, 360, "salmon", 0.08);
  nigiri(buffer, 880, 334, "tuna", 0.14);
  nigiri(buffer, 988, 370, "salmon", 0.24);
  nigiri(buffer, 690, 560, "tuna", -0.24);
  nigiri(buffer, 822, 598, "salmon", 0.05);
  nigiri(buffer, 952, 560, "tuna", 0.18);

  roll(buffer, 738, 472, color(235, 112, 82));
  roll(buffer, 812, 470, color(104, 154, 91));
  roll(buffer, 886, 468, color(238, 148, 92));
  roll(buffer, 960, 468, color(218, 73, 78));
  roll(buffer, 775, 650, color(239, 121, 86));
  roll(buffer, 850, 646, color(121, 170, 104));
  roll(buffer, 925, 642, color(224, 83, 85));

  hotRoll(buffer, 1034, 490);
  hotRoll(buffer, 1108, 534);
  hotRoll(buffer, 1012, 586);

  avocado(buffer, 598, 334, -0.3);
  avocado(buffer, 570, 620, -0.1);
  wasabi(buffer, 1040, 662);
  ginger(buffer, 615, 677);
  garnish(buffer);
  drizzle(buffer, 830, 470, 340, 194, color(59, 49, 38));
}

function buildBmp(pixelData) {
  const rowStride = width * 3;
  const rowPadding = (4 - (rowStride % 4)) % 4;
  const imageSize = (rowStride + rowPadding) * height;
  const fileSize = 54 + imageSize;
  const file = Buffer.alloc(fileSize);

  file.write("BM", 0, 2, "ascii");
  file.writeUInt32LE(fileSize, 2);
  file.writeUInt32LE(54, 10);
  file.writeUInt32LE(40, 14);
  file.writeInt32LE(width, 18);
  file.writeInt32LE(-height, 22);
  file.writeUInt16LE(1, 26);
  file.writeUInt16LE(24, 28);
  file.writeUInt32LE(0, 30);
  file.writeUInt32LE(imageSize, 34);
  file.writeInt32LE(2835, 38);
  file.writeInt32LE(2835, 42);

  let offset = 54;
  for (let y = 0; y < height; y += 1) {
    const start = y * rowStride;
    pixelData.copy(file, offset, start, start + rowStride);
    offset += rowStride;
    offset += rowPadding;
  }

  return file;
}

async function main() {
  const pixels = Buffer.alloc(width * height * 3);
  background(pixels);
  chopsticks(pixels);
  plate(pixels);
  paintDish(pixels);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, buildBmp(pixels));
  console.log(`Imagem gerada em ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
