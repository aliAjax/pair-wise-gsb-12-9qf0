<script setup lang="ts">
import { computed, ref } from "vue";
import { useDispatchStore } from "./stores/dispatch";
import { createSeedState } from "./data/seed";
import TaskForm from "./components/TaskForm.vue";
import TaskBoard from "./components/TaskBoard.vue";
import RescueConsole from "./components/RescueConsole.vue";
import VehiclePanel from "./components/VehiclePanel.vue";
import AnomalyCenter from "./components/AnomalyCenter.vue";
import RescueLog from "./components/RescueLog.vue";

const store = useDispatchStore();
const rescueTaskId = ref<string | null>(null);

const metrics = computed(() => [
  { label: "任务总数", value: store.tasks.length },
  { label: "执行中", value: store.tasks.filter((task) => task.status === "执行中").length },
  { label: "故障 / 冻结车辆", value: store.vehicles.filter((v) => v.mileageLocked).length },
  { label: "救援转派次数", value: store.rescues.length },
  { label: "待处理异常", value: store.anomalies.length },
  { label: "救援费合计（元）", value: store.rescueFeeTotal }
]);

function openRescue(taskId: string) {
  rescueTaskId.value = taskId;
}

function restoreSeed() {
  if (confirm("确定恢复演示数据？当前的任务、救援与版本记录将被覆盖。")) {
    store.resetToSeed(createSeedState());
    rescueTaskId.value = null;
  }
}
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">物流调度 · 故障救援与转派台</p>
          <h1>车辆调度：故障救援与转派</h1>
          <p class="subtitle">
            故障后冻结里程，仅余货重、温区与班次校验通过的车辆可接管；连续驾驶超四小时或温区不符整单拒绝并保留原派单；
            转派记录故障位置、原因与救援费，新车继承剩余线路；再次故障须填写升级说明并生成新版本。
          </p>
        </div>
        <div class="stack">
          <span v-for="item in ['Vue3', 'TypeScript', 'Pinia', '规则引擎', 'localStorage']" :key="item" class="tag">
            {{ item }}
          </span>
          <button type="button" class="secondary" @click="restoreSeed">恢复演示数据</button>
        </div>
      </header>

      <section class="metrics">
        <article v-for="metric in metrics" :key="metric.label" class="metric">
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
        </article>
      </section>

      <RescueConsole :task-id="rescueTaskId" @close="rescueTaskId = null" />

      <section class="workspace">
        <TaskForm />
        <TaskBoard @rescue="openRescue" />
      </section>

      <AnomalyCenter />
      <VehiclePanel />
      <RescueLog />
    </div>
  </main>
</template>
