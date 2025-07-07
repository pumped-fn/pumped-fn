import {themes as prismThemes} from 'prism-react-renderer';

const config = {
  title: 'Pumped Fn',
  tagline: 'Functional reactive state management for React',
  favicon: 'img/favicon.ico',

  url: 'https://pumped-fn.github.io',
  baseUrl: '/pumped-fn/',

  organizationName: 'pumped-fn',
  projectName: 'pumped-fn',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      ({
        docs: {
          sidebarPath: './sidebars.js',
          editUrl: 'https://github.com/pumped-fn/pumped-fn/tree/main/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themes: ['@docusaurus/theme-live-codeblock'],

  themeConfig: {
    image: 'img/docusaurus-social-card.jpg',
    navbar: {
      title: 'Pumped Fn',
      logo: {
        alt: 'Pumped Fn Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://github.com/pumped-fn/pumped-fn',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Getting Started',
              to: '/docs/intro',
            },
            {
              label: 'Core Concepts',
              to: '/docs/core-concepts/executors',
            },
            {
              label: 'React Integration',
              to: '/docs/react/overview',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/pumped-fn/pumped-fn',
            },
            {
              label: 'Issues',
              href: 'https://github.com/pumped-fn/pumped-fn/issues',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'Examples',
              to: '/docs/examples/counter',
            },
            {
              label: 'NPM',
              href: 'https://www.npmjs.com/package/@pumped-fn/core-next',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Pumped Fn. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
    liveCodeBlock: {
      playgroundPosition: 'bottom',
    },
  },
};

export default config;