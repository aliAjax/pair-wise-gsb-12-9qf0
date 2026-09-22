<script setup lang="ts">
import { computed } from "vue";
import { useDispatchStore } from "../stores/dispatch";
import type { AnomalyKind } from "../data/types";

const store = useDispatchStore();

const KINDS: AnomalyKind[] = ["任务", "车辆", "超重", "温区", "规则"];

const groups = computed(() =>
  KINDS.map((kind) => ({
    kind,
    items: store.anomalies.filter((anomaly) => anomaly.kind === kind)
  }))
);
</script>

<template>
  <section class="panel anomaly-panel">
    <div class="toolbar">
      <h2>异常中心</h2>
      <span class="total">共 {{ store.anomalies.length }} 项</span>
    </div>

    <div v-if="store.anomalies.length === 0" class="empty">暂无异常：任务、车辆、占用与规则全部一致</div>

    <div v-else class="anomaly-grid">
      <div v-for="group in groups" :key="group.kind" class="anomaly-group">
        <div class="group-head">
          <span :class="['kind-dot', `k-${group.kind}`]" />
          <strong>{{ group.kind }}</strong>
          <span class="count">{{ group.items.length }}</span>
        </div>
        <ul>
          <li v-for="item in group.items" :key="item.id">
            <p class="title">{{ item.title }}</p>
            <p class="detail">{{ item.detail }}</p>
          </li>
          <li v-if="group.items.length === 0" class="none">无</li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.total {
  color: #69758c;
  font-size: 13px;
}
.anomaly-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}
.anomaly-group {
  border: 1px solid #dfe7f1;
  border-radius: 8px;
  padding: 10px 12px;
  background: #fbfcfe;
}
.group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.kind-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  display: inline-block;
}
.k-任务 { background: #176b87; }
.k-车辆 { background: #b23b26; }
.k-超重 { background: #d98a1f; }
.k-温区 { background: #7b54c9; }
.k-规则 { background: #c93f7b; }
.count {
  margin-left: auto;
  background: #e8eef5;
  border-radius: 999px;
  font-size: 12px;
  padding: 1px 8px;
  color: #445069;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
li .title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}
li .detail {
  margin: 2px 0 0;
  font-size: 12px;
  color: #69758c;
  line-height: 1.5;
}
li.none {
  color: #a6b0c0;
  font-size: 12px;
}
</style>
