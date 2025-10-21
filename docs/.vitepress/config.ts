import { defineConfig } from "vitepress";
import { transformerTwoslash } from "@shikijs/vitepress-twoslash";
import { createFileSystemTypesCache } from "@shikijs/vitepress-twoslash/cache-fs";
import { withMermaid } from "vitepress-plugin-mermaid";

export default withMermaid(defineConfig({
    title: "Pumped Functions",
    description: "Graph-based dependency resolution for TypeScript",
    base: "/pumped-fn/",
    srcExclude: ["**/plans/**"],
    ignoreDeadLinks: false,

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
            { text: "Introduction", link: "/" },
          ],
        },
        {
          text: "Guides",
          items: [
            { text: "Executors and Dependencies", link: "/guides/01-executors-and-dependencies" },
            { text: "Tags: The Type System", link: "/guides/02-tags-the-type-system" },
            { text: "Scope Lifecycle", link: "/guides/03-scope-lifecycle" },
            { text: "Type Inference Patterns", link: "/guides/04-type-inference-patterns" },
            { text: "Flow Basics", link: "/guides/05-flow-basics" },
            { text: "Flow Composition", link: "/guides/06-flow-composition" },
            { text: "Promised API", link: "/guides/07-promised-api" },
            { text: "Reactive Patterns", link: "/guides/08-reactive-patterns" },
            { text: "Extensions", link: "/guides/09-extensions" },
            { text: "Error Handling", link: "/guides/10-error-handling" },
          ],
        },
        {
          text: "Patterns",
          items: [
            { text: "HTTP Server Setup", link: "/patterns/http-server-setup" },
            { text: "Database Transactions", link: "/patterns/database-transactions" },
            { text: "Testing Strategies", link: "/patterns/testing-strategies" },
            { text: "Middleware Composition", link: "/patterns/middleware-composition" },
          ],
        },
        {
          text: "Reference",
          items: [
            { text: "API Cheatsheet", link: "/reference/api-cheatsheet" },
            { text: "Type Verification", link: "/reference/type-verification" },
            { text: "Common Mistakes", link: "/reference/common-mistakes" },
            { text: "Error Solutions", link: "/reference/error-solutions" },
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
              noImplicitAny: false,
            },
          },
        }),
      ],
    },

    vite: {},
  }));
