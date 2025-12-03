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
          text: "ExecutionContext-first",
          items: [
            { text: "Activation Map", link: "/" },
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
              baseUrl: "..",
              paths: {
                "@pumped-fn/lite": ["./packages/lite/src/index.ts"],
              },
            },
          },
        }),
      ],
    },

    vite: {},
  }));
