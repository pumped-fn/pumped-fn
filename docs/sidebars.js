const sidebars = {
  tutorialSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Getting Started',
      items: [
        'getting-started/installation',
        'getting-started/quick-start',
        'getting-started/first-app',
      ],
    },
    {
      type: 'category',
      label: 'Core Concepts',
      items: [
        'core-concepts/executors',
      ],
    },
    {
      type: 'category',
      label: 'React Integration',
      items: [
        'react/overview',
      ],
    },
    {
      type: 'category',
      label: 'Testing',
      items: [
        'testing/overview',
        'testing/testing-executors',
        'testing/testing-react',
        'testing/testing-utilities',
        'testing/interactive-testing',
      ],
    },
    {
      type: 'category',
      label: 'Examples',
      items: [
        'examples/counter',
      ],
    },
  ],
};

export default sidebars;