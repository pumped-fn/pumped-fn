<template>
  <div class="feature-grid">
    <div 
      v-for="(feature, index) in features" 
      :key="index"
      class="feature-card"
    >
      <div v-if="feature.icon" class="feature-icon">
        {{ feature.icon }}
      </div>
      <h3 class="feature-title">
        {{ feature.title }}
      </h3>
      <p class="feature-description">
        {{ feature.description }}
      </p>
    </div>
  </div>
</template>

<script setup>
defineProps({
  features: {
    type: Array,
    required: true,
    validator: (features) => {
      return features.every(feature => 
        typeof feature.title === 'string' && 
        typeof feature.description === 'string'
      )
    }
  }
})
</script>