import meta from "../../../pages/_meta.js";
import core_concepts_meta from "../../../pages/core-concepts/_meta.js";
import examples_meta from "../../../pages/examples/_meta.js";
import getting_started_meta from "../../../pages/getting-started/_meta.js";
import react_meta from "../../../pages/react/_meta.js";
import testing_meta from "../../../pages/testing/_meta.js";
export const pageMap = [{
  data: meta
}, {
  name: "core-concepts",
  route: "/core-concepts",
  children: [{
    data: core_concepts_meta
  }, {
    name: "executors",
    route: "/core-concepts/executors",
    frontMatter: {
      "sidebarTitle": "Executors"
    }
  }]
}, {
  name: "examples",
  route: "/examples",
  children: [{
    data: examples_meta
  }, {
    name: "counter",
    route: "/examples/counter",
    frontMatter: {
      "sidebarTitle": "Counter"
    }
  }]
}, {
  name: "getting-started",
  route: "/getting-started",
  children: [{
    data: getting_started_meta
  }, {
    name: "first-app",
    route: "/getting-started/first-app",
    frontMatter: {
      "sidebarTitle": "First App"
    }
  }, {
    name: "installation",
    route: "/getting-started/installation",
    frontMatter: {
      "sidebarTitle": "Installation"
    }
  }, {
    name: "quick-start",
    route: "/getting-started/quick-start",
    frontMatter: {
      "sidebarTitle": "Quick Start"
    }
  }]
}, {
  name: "index",
  route: "/",
  frontMatter: {
    "sidebarTitle": "Index"
  }
}, {
  name: "react",
  route: "/react",
  children: [{
    data: react_meta
  }, {
    name: "overview",
    route: "/react/overview",
    frontMatter: {
      "sidebarTitle": "Overview"
    }
  }]
}, {
  name: "testing",
  route: "/testing",
  children: [{
    data: testing_meta
  }, {
    name: "interactive-testing",
    route: "/testing/interactive-testing",
    frontMatter: {
      "sidebarTitle": "Interactive Testing"
    }
  }, {
    name: "overview",
    route: "/testing/overview",
    frontMatter: {
      "sidebarTitle": "Overview"
    }
  }, {
    name: "testing-executors",
    route: "/testing/testing-executors",
    frontMatter: {
      "sidebarTitle": "Testing Executors"
    }
  }, {
    name: "testing-react",
    route: "/testing/testing-react",
    frontMatter: {
      "sidebarTitle": "Testing React"
    }
  }, {
    name: "testing-utilities",
    route: "/testing/testing-utilities",
    frontMatter: {
      "sidebarTitle": "Testing Utilities"
    }
  }]
}];