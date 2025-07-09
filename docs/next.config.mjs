import nextra from 'nextra';

const withNextra = nextra({
  mdxOptions: {
    rehypePrettyCodeOptions: {
      theme: {
        light: 'github-light',
        dark: 'github-dark'
      },
      defaultShowCopyCode: true
    }
  }
});

export default withNextra({
  images: {
    unoptimized: true,
  },
  output: 'export',
  cleanDistDir: true,
  basePath: '/pumped-fn',
});