<script setup lang="ts">
import { computed, ref } from "vue";
import { useDispatchStore } from "../stores/dispatch";
import { activeStops, evaluateTakeover, formatTime, remainingWeight } from "../domain/rules";
import type { Task } from "../data/types";

const emit = defineEmits<{ (event: "rescue", taskId: string): void }>();
const store = useDispatchStore();

const candidate = ref<Record<string, string>>({});
const feedback = ref<Record<string, string>>({});

function vehicleName(id: string | null) {
  const vehicle = store.vehicles.find((item) => item.id === id);
  return vehicle ? `${vehicle.plate} / ${vehicle.driver}` : "未派车";
}

function candidateVehicle(task: Task) {
  const id = candidate.value[task.id];
  return store.vehicles.find((vehicle) => vehicle.id === id);
}

function preview(task: Task) {
  const vehicle = candidateVehicle(task);
  if (!vehicle) return null;
  return evaluateTakeover(vehicle, task);
}

function assign(task: Task) {
  const id = candidate.value[task.id];
  if (!id) {
    feedback.value[task.id] = "请先选择车辆";
    return;
  }
  const result = store.assignTask(task.id, id);
  feedback.value[task.id] = result.ok
    ? "派车成功，任务进入执行中"
    : `整单拒绝：${result.reasons.join("；")}（原派单保留）`;
}

function deliver(task: Task, stopId: string) {
  store.deliverStop(task.id, stopId);
}

const idleVehicles = computed(() => store.vehicles.filter((vehicle) => vehicle.status === "空闲"));
</script>

<template>
  <section class="panel list-panel">
    <h2>任务与派车</h2>
    <div class="task-grid">
      <article v-for="task in store.tasks" :key="task.id" class="task-card">
        <div class="record-head">
          <div>
            <p class="record-title">{{ task.code }} · {{ task.name }}</p>
            <p class="sub">{{ task.shift }} ｜ 当前版本 v{{ task.version }} ｜ 剩余货重
              <strong>{{ remainingWeight(task) }}</strong> 吨
            </p>
          </div>
          <span :class="['status', `st-${task.status}`]">{{ task.status }}</span>
        </div>

        <ul class="stops">
          <li v-for="stop in task.stops" :key="stop.id" :class="{ done: stop.done }">
            <span class="dot" :class="`zone-${stop.zone}`" :title="`温区 ${stop.zone}`" />
            <span class="stop-name">{{ stop.name }}</span>
            <span class="tag">{{ stop.zone }}</span>
            <span>{{ stop.weight }} 吨</span>
            <button
              v-if="task.status === '执行中' && !stop.done"
              type="button"
              class="mini"
              @click="deliver(task, stop.id)"
            >
              送达
            </button>
            <span v-else-if="stop.done" class="delivered">已送达</span>
          </li>
        </ul>

        <div v-if="task.status === '待派'" class="assign-box">
          <select v-model="candidate[task.id]">
            <option value="">选择接管车辆…</option>
            <option v-for="vehicle in idleVehicles" :key="vehicle.id" :value="vehicle.id">
              {{ vehicle.plate }} {{ vehicle.driver }} · {{ vehicle.zone }} · 载重{{ vehicle.capacity }}吨 · {{ vehicle.shift }}
            </option>
          </select>
          <ul v-if="preview(task)" class="checks">
            <li v-for="(reason, i) in preview(task)!.reasons" :key="i" class="bad">✗ {{ reason }}</li>
            <li v-if="preview(task)!.ok" class="ok">✓ 余货重、温区、班次、驾驶时长与占用全部通过</li>
          </ul>
          <button type="button" :disabled="!candidate[task.id] || preview(task)?.ok === false" @click="assign(task)">
            派车
          </button>
        </div>

        <div v-else-if="task.status === '执行中'" class="assign-box">
          <p class="assigned">执行车辆：{{ vehicleName(task.assignedVehicleId) }}</p>
          <button type="button" class="warn" @click="emit('rescue', task.id)">上报故障 · 转派</button>
        </div>

        <details class="timeline">
          <summary>版本与救援记录（{{ store.timelineOf(task).length }}）</summary>
          <ol>
            <li v-for="entry in store.timelineOf(task)" :key="entry.version">
              <strong>v{{ entry.version }} {{ entry.label }}</strong>
              <span>{{ entry.vehiclePlate || "—" }} ｜ {{ formatTime(entry.at) }}</span>
              <template v-if="entry.rescue">
                <p>
                  故障位置：{{ entry.rescue.location }} ｜ 原因：{{ entry.rescue.reason }} ｜
                  救援费：¥{{ entry.rescue.fee }} ｜ 冻结里程：{{ entry.rescue.frozenMileage }} 公里
                </p>
                <p v-if="entry.rescue.escalation" class="escalation">
                  升级说明（第 {{ entry.rescue.version }} 次故障）：{{ entry.rescue.escalation }}
                </p>
                <p class="inherit">
                  新车继承线路：{{ entry.rescue.inheritedStops.map((s) => `${s.name}(${s.weight}吨/${s.zone})`).join("、") || "无剩余停靠点" }}
                </p>
              </template>
            </li>
          </ol>
        </details>

        <p v-if="feedback[task.id]" :class="['feedback', feedback[task.id].includes('拒绝') ? 'bad' : 'ok']">
          {{ feedback[task.id] }}
        </p>

        <p v-if="task.status === '已完成'" class="assigned">全部停靠点已送达，任务完成，车辆占用已释放。</p>
      </article>
    </div>
  </section>
</template>
