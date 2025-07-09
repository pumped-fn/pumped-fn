import { describe, it, expect } from "vitest";
import { ImageGenerator, ImageFormat } from "../src/image-generator.js";
import { DependencyGraph } from "../src/ast-analyzer.js";

describe("ImageGenerator", () => {
  const mockGraph: DependencyGraph = {
    nodes: [
      {
        name: "config",
        type: "provide",
        dependencies: [],
        location: { file: "test.ts", line: 5, column: 1 },
        metaName: "config"
      },
      {
        name: "processor",
        type: "derive",
        dependencies: ["config"],
        location: { file: "test.ts", line: 10, column: 1 },
        metaName: "processor"
      }
    ],
    edges: [
      { from: "config", to: "processor" }
    ]
  };

  describe("getSupportedFormats", () => {
    it("should return all supported image formats", () => {
      const formats = ImageGenerator.getSupportedFormats();
      expect(formats).toEqual(["png", "jpg", "jpeg", "svg", "pdf", "webp"]);
    });
  });

  describe("validateFormat", () => {
    it("should validate supported formats", () => {
      expect(ImageGenerator.validateFormat("png")).toBe(true);
      expect(ImageGenerator.validateFormat("jpg")).toBe(true);
      expect(ImageGenerator.validateFormat("svg")).toBe(true);
      expect(ImageGenerator.validateFormat("pdf")).toBe(true);
      expect(ImageGenerator.validateFormat("webp")).toBe(true);
    });

    it("should reject unsupported formats", () => {
      expect(ImageGenerator.validateFormat("gif")).toBe(false);
      expect(ImageGenerator.validateFormat("bmp")).toBe(false);
      expect(ImageGenerator.validateFormat("invalid")).toBe(false);
    });
  });

  describe("getFormatInfo", () => {
    it("should return correct format info for PNG", () => {
      const info = ImageGenerator.getFormatInfo("png");
      expect(info).toEqual({
        extension: ".png",
        mimeType: "image/png",
        supportsTransparency: true,
        supportsQuality: false,
      });
    });

    it("should return correct format info for JPG", () => {
      const info = ImageGenerator.getFormatInfo("jpg");
      expect(info).toEqual({
        extension: ".jpg",
        mimeType: "image/jpeg",
        supportsTransparency: false,
        supportsQuality: true,
      });
    });

    it("should return correct format info for SVG", () => {
      const info = ImageGenerator.getFormatInfo("svg");
      expect(info).toEqual({
        extension: ".svg",
        mimeType: "image/svg+xml",
        supportsTransparency: true,
        supportsQuality: false,
      });
    });

    it("should return correct format info for PDF", () => {
      const info = ImageGenerator.getFormatInfo("pdf");
      expect(info).toEqual({
        extension: ".pdf",
        mimeType: "application/pdf",
        supportsTransparency: false,
        supportsQuality: false,
      });
    });

    it("should return correct format info for WebP", () => {
      const info = ImageGenerator.getFormatInfo("webp");
      expect(info).toEqual({
        extension: ".webp",
        mimeType: "image/webp",
        supportsTransparency: true,
        supportsQuality: true,
      });
    });
  });

  describe("constructor", () => {
    it("should create ImageGenerator with default options", () => {
      const generator = new ImageGenerator();
      expect(generator).toBeInstanceOf(ImageGenerator);
    });

    it("should create ImageGenerator with custom mermaid options", () => {
      const generator = new ImageGenerator({ theme: "dark" });
      expect(generator).toBeInstanceOf(ImageGenerator);
    });
  });

  describe("generateStandaloneHTML", () => {
    it("should generate HTML with transparent background", () => {
      const generator = new ImageGenerator();
      const html = generator["generateStandaloneHTML"](mockGraph, 1920, 1080, true);
      
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("background: transparent");
      expect(html).toContain("mermaid.initialize");
      expect(html).toContain("graph TD");
    });

    it("should generate HTML with white background", () => {
      const generator = new ImageGenerator();
      const html = generator["generateStandaloneHTML"](mockGraph, 1920, 1080, false);
      
      expect(html).toContain("background: #ffffff");
    });

    it("should include mermaid diagram code", () => {
      const generator = new ImageGenerator();
      const html = generator["generateStandaloneHTML"](mockGraph, 1920, 1080, true);
      
      expect(html).toContain('config["config (provide)"]');
      expect(html).toContain('processor("processor (derive)")');
      expect(html).toContain("config --> processor");
    });
  });
});