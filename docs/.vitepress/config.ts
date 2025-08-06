import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Pumped Functions",
  description:
    "TypeScript functional programming library with container-based dependency injection and reactive programming patterns",
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

    nav: [
      { text: "Guide", link: "/getting-started/quickstart" },
      { text: "Examples", link: "/show-me-code" },
      { text: "FAQ", link: "/faq" },
    ],

    sidebar: [
      // { text: "Overview", link: "/" },
      // { text: "Quick Start", link: "/getting-started/quickstart" },
      // { text: "Examples", link: "/show-me-code" },
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
      // Add twoslash support if needed
    ],
  },

  vite: {
    // Add any Vite-specific configuration here
  },
});
