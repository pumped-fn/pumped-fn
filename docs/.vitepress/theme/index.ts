import DefaultTheme from 'vitepress/theme'
import FeatureGrid from './components/FeatureGrid.vue'
import CodeComparison from './components/CodeComparison.vue'
import ComparisonTable from './components/ComparisonTable.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('FeatureGrid', FeatureGrid)
    app.component('CodeComparison', CodeComparison)
    app.component('ComparisonTable', ComparisonTable)
  }
}