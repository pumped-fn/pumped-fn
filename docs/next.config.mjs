import nextra from 'nextra';

const withNextra = nextra({});

export default withNextra({
  images: {
    unoptimized: true,
  },
  output: 'export',
  cleanDistDir: true,
  basePath: '/pumped-fn',
});