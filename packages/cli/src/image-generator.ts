import puppeteer from "puppeteer";
import sharp from "sharp";
import * as fs from "fs";
import * as path from "path";
import { MermaidGenerator } from "./mermaid-generator.js";
import { DependencyGraph } from "./ast-analyzer.js";

export type ImageFormat = "png" | "jpg" | "jpeg" | "svg" | "pdf" | "webp";

export interface ImageGeneratorOptions {
  format: ImageFormat;
  width?: number;
  height?: number;
  quality?: number; // For JPEG/WebP
  transparent?: boolean; // For PNG
  mermaidOptions?: any;
}

export class ImageGenerator {
  private mermaidGenerator: MermaidGenerator;

  constructor(mermaidOptions?: any) {
    this.mermaidGenerator = new MermaidGenerator(mermaidOptions);
  }

  async generateImage(
    graph: DependencyGraph,
    outputPath: string,
    options: ImageGeneratorOptions
  ): Promise<void> {
    const { format, width = 1920, height = 1080, quality = 90, transparent = true } = options;

    // Generate HTML with Mermaid diagram
    const html = this.generateStandaloneHTML(graph, width, height, transparent);

    // Launch Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const page = await browser.newPage();
      
      // Set viewport
      await page.setViewport({ width, height });

      // Load HTML content
      await page.setContent(html, { waitUntil: "networkidle0" });

      // Wait for Mermaid to render
      await page.waitForSelector(".mermaid svg", { timeout: 30000 });

      // Get the actual diagram dimensions
      const svgBounds = await page.evaluate(() => {
        const svg = document.querySelector(".mermaid svg");
        if (svg) {
          const rect = svg.getBoundingClientRect();
          return {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
          };
        }
        return null;
      });

      if (!svgBounds) {
        throw new Error("Failed to find Mermaid diagram");
      }

      // Handle different formats
      switch (format) {
        case "svg": {
          const svgContent = await page.evaluate(() => {
            const svg = document.querySelector(".mermaid svg");
            return svg ? svg.outerHTML : null;
          });
          
          if (svgContent) {
            await fs.promises.writeFile(outputPath, svgContent, "utf-8");
          }
          break;
        }

        case "pdf": {
          await page.pdf({
            path: outputPath,
            width: svgBounds.width + 100,
            height: svgBounds.height + 100,
            printBackground: true,
          });
          break;
        }

        default: {
          // PNG, JPG, JPEG, WebP
          const screenshot = await page.screenshot({
            type: format === "jpg" ? "jpeg" : (format as "png" | "jpeg" | "webp"),
            quality: ["jpeg", "jpg", "webp"].includes(format) ? quality : undefined,
            omitBackground: format === "png" && transparent,
            clip: {
              x: Math.max(0, svgBounds.x - 50),
              y: Math.max(0, svgBounds.y - 50),
              width: svgBounds.width + 100,
              height: svgBounds.height + 100,
            },
          });

          // For formats other than PNG/JPEG/WebP, use Sharp to convert
          if (format === "jpg" && outputPath.endsWith(".jpg")) {
            // Rename jpg to jpeg for consistency
            await fs.promises.writeFile(outputPath, screenshot);
          } else {
            await fs.promises.writeFile(outputPath, screenshot);
          }
        }
      }
    } finally {
      await browser.close();
    }
  }

  private generateStandaloneHTML(
    graph: DependencyGraph,
    width: number,
    height: number,
    transparent: boolean
  ): string {
    const mermaidCode = this.mermaidGenerator.generate(graph);
    const backgroundColor = transparent ? "transparent" : "#ffffff";

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <style>
    body {
      margin: 0;
      padding: 50px;
      background: ${backgroundColor};
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .mermaid {
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="mermaid">
${mermaidCode}
  </div>
  <script>
    mermaid.initialize({
      startOnLoad: true,
      theme: '${this.mermaidGenerator["options"]?.theme || "default"}',
      flowchart: {
        useMaxWidth: false,
        htmlLabels: true
      }
    });
  </script>
</body>
</html>`;
  }

  static getSupportedFormats(): ImageFormat[] {
    return ["png", "jpg", "jpeg", "svg", "pdf", "webp"];
  }

  static validateFormat(format: string): format is ImageFormat {
    return this.getSupportedFormats().includes(format as ImageFormat);
  }

  static getFormatInfo(format: ImageFormat): {
    extension: string;
    mimeType: string;
    supportsTransparency: boolean;
    supportsQuality: boolean;
  } {
    const info = {
      png: {
        extension: ".png",
        mimeType: "image/png",
        supportsTransparency: true,
        supportsQuality: false,
      },
      jpg: {
        extension: ".jpg",
        mimeType: "image/jpeg",
        supportsTransparency: false,
        supportsQuality: true,
      },
      jpeg: {
        extension: ".jpeg",
        mimeType: "image/jpeg",
        supportsTransparency: false,
        supportsQuality: true,
      },
      svg: {
        extension: ".svg",
        mimeType: "image/svg+xml",
        supportsTransparency: true,
        supportsQuality: false,
      },
      pdf: {
        extension: ".pdf",
        mimeType: "application/pdf",
        supportsTransparency: false,
        supportsQuality: false,
      },
      webp: {
        extension: ".webp",
        mimeType: "image/webp",
        supportsTransparency: true,
        supportsQuality: true,
      },
    };

    return info[format];
  }
}