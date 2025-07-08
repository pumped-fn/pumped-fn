import nextra from 'nextra';

const withNextra = nextra({
  contentDirBasePath: '/pumped-fn'
});

export default withNextra({
  images: {
    unoptimized: true,
  },
  output: 'export',
  cleanDistDir: true,
});