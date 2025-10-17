import { defineConfig } from "vitepress";
import { transformerTwoslash } from "@shikijs/vitepress-twoslash";
import { createFileSystemTypesCache } from "@shikijs/vitepress-twoslash/cache-fs";
import { withMermaid } from "vitepress-plugin-mermaid";

export default withMermaid(defineConfig({
    title: "Pumped Functions",
    description: "Graph-based dependency resolution for TypeScript",
    base: "/pumped-fn/",

    head: [
      ["link", { rel: "icon", href: "/pumped-fn/favicon.ico" }],
      [
        "link",
        {
          rel: "apple-touch-icon",
          sizes: "180x180",
          href: "/pumped-fn/apple-icon-180x180.png",
        },
      ],
      [
        "link",
        {
          rel: "icon",
          type: "image/png",
          sizes: "32x32",
          href: "/pumped-fn/favicon-32x32.png",
        },
      ],
      [
        "link",
        {
          rel: "icon",
          type: "image/png",
          sizes: "16x16",
          href: "/pumped-fn/favicon-16x16.png",
        },
      ],
      ["link", { rel: "manifest", href: "/pumped-fn/manifest.json" }],
    ],

    themeConfig: {
      logo: "/ms-icon-70x70.png",

      nav: [],

      sidebar: [
        {
          text: "Getting Started",
          items: [
            { text: "Home", link: "/" },
            { text: "Quick Start", link: "/quick-start" },
            { text: "Graph vs Traditional", link: "/graph-vs-traditional" },
            { text: "How It Works", link: "/how-does-it-work" },
          ],
        },
        {
          text: "Core Concepts",
          items: [
            { text: "Executors and Scopes", link: "/concepts/executors-and-scopes" },
            { text: "Flows", link: "/concepts/flows" },
            { text: "Extensions", link: "/concepts/extensions" },
            { text: "Multi-Executors", link: "/concepts/multi-executors" },
            { text: "Accessors", link: "/concepts/accessors" },
          ],
        },
        {
          text: "Patterns & Best Practices",
          items: [
            { text: "Testing Strategies", link: "/patterns/testing-strategies" },
            { text: "Lifecycle Management", link: "/patterns/lifecycle-management" },
            { text: "Framework Integration", link: "/patterns/framework-integration" },
          ],
        },
        {
          text: "Decision Guides",
          items: [
            { text: "Executors vs Flows", link: "/decisions/executors-vs-flows" },
            { text: "Lazy vs Reactive", link: "/decisions/lazy-vs-reactive" },
            { text: "Graph Design", link: "/decisions/graph-design" },
            { text: "Anti-Patterns", link: "/decisions/anti-patterns" },
          ],
        },
        {
          text: "API Reference",
          items: [
            { text: "Complete API", link: "/api" },
            { text: "Flow API", link: "/flow" },
            { text: "DataAccessor", link: "/accessor" },
            { text: "Extensions", link: "/extensions" },
            { text: "Meta System", link: "/meta" },
            { text: "Utilities", link: "/utilities" },
          ],
        },
        {
          text: "Guides",
          items: [
            { text: "Component Authoring", link: "/authoring" },
            { text: "LLM Integration", link: "/llm-guide" },
          ],
        },
      ],

      socialLinks: [
        { icon: "github", link: "https://github.com/pumped-fn/pumped-fn" },
      ],

      search: {
        provider: "local",
      },

      footer: {
        message: "Released under the MIT License.",
        copyright: "Copyright © 2025 Pumped Functions",
      },
    },

    markdown: {
      theme: {
        light: "github-light",
        dark: "github-dark",
      },
      codeTransformers: [
        transformerTwoslash({
          typesCache: createFileSystemTypesCache(),
          twoslashOptions: {
            compilerOptions: {
              baseUrl: ".",
              paths: {
                "@pumped-fn/core-next": ["../packages/next/src/index.ts"],
              },
              noImplicitAny: false,
            },
          },
        }),
      ],
    },

    vite: {},
  }));
