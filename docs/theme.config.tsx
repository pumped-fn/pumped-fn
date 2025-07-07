import React from 'react'
import { DocsThemeConfig } from 'nextra-theme-docs'

const config: DocsThemeConfig = {
  logo: <span style={{ fontWeight: 'bold' }}>Pumped Fn</span>,
  project: {
    link: 'https://github.com/pumped-fn/pumped-fn',
  },
  docsRepositoryBase: 'https://github.com/pumped-fn/pumped-fn/tree/main/docs',
}

export default config