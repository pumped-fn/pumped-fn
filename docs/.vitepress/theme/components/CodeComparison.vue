<template>
  <div class="code-comparison">
    <div class="code-comparison-card code-comparison-before">
      <div class="code-comparison-header">
        ❌ {{ before.title }}
      </div>
      <div class="code-comparison-content">
        <pre><code :class="`language-${before.language || 'typescript'}`">{{ before.code }}</code></pre>
      </div>
    </div>
    
    <div class="code-comparison-card code-comparison-after">
      <div class="code-comparison-header">
        ✅ {{ after.title }}
      </div>
      <div class="code-comparison-content">
        <pre><code :class="`language-${after.language || 'typescript'}`">{{ after.code }}</code></pre>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  before: {
    type: Object,
    required: true,
    validator: (before) => {
      return typeof before.title === 'string' && typeof before.code === 'string'
    }
  },
  after: {
    type: Object,
    required: true,
    validator: (after) => {
      return typeof after.title === 'string' && typeof after.code === 'string'
    }
  }
})
</script>