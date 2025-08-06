<template>
  <div style="overflow-x: auto;">
    <table class="comparison-table">
      <thead>
        <tr>
          <th>Feature</th>
          <th class="highlight">Pumped Functions</th>
          <th>Redux Toolkit</th>
          <th>Zustand</th>
          <th>InversifyJS</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(item, index) in items" :key="index">
          <td><strong>{{ item.feature }}</strong></td>
          <td class="highlight">{{ item.pumpedFn }}</td>
          <td>{{ item.redux }}</td>
          <td>{{ item.zustand }}</td>
          <td>{{ item.inversify }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
defineProps({
  items: {
    type: Array,
    required: true,
    validator: (items) => {
      return items.every(item => 
        typeof item.feature === 'string' &&
        (typeof item.pumpedFn === 'string' || typeof item.pumpedFn === 'object') &&
        (typeof item.redux === 'string' || typeof item.redux === 'object') &&
        (typeof item.zustand === 'string' || typeof item.zustand === 'object') &&
        (typeof item.inversify === 'string' || typeof item.inversify === 'object')
      )
    }
  }
})
</script>