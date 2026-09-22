<script setup lang="ts">
import { ref } from "vue";
import { useDispatchStore } from "../stores/dispatch";
import { MAX_DRIVING_HOURS } from "../domain/rules";
import type { Vehicle } from "../data/types";

const store = useDispatchStore();
const feedback = ref<Record<string, string>>({});

function boundTask(vehicle: Vehicle) {
  return store.tasks.find((task) => task.id === vehicle.taskId);
}

function patchTelemetry(vehicle: Vehicle, field: "mileage" | "drivingHours", value: number) {
  const result = store.updateVehicleTelemetry(vehicle.id, { [field]: value });
  if (!result.ok) feedback.value[vehicle.id] = result.reasons.join("；");
  else feedback.value[vehicle.id] = "";
}

function repair(vehicle: Vehicle) {
  const result = store.repairVehicle(vehicle.id);
  feedback.value[vehicle.id] = result.ok
    ? "维修完成：里程保留并解除冻结，车辆回到空闲"
    : result.reasons.join("；");
}
</script>

<template>
  <section class="panel list-panel">
    <h2>车辆占用与冻结</h2>
    <div class="vehicle-grid">
      <article v-for="vehicle in store.vehicles" :key="vehicle.id" class="vehicle-card">
        <div class="record-head">
          <p class="record-title">{{ vehicle.plate }} <span class="driver">{{ vehicle.driver }}</span></p>
          <span :class="['status', `v-${vehicle.status}`]">{{ vehicle.status }}</span>
        </div>
        <div class="vehicle-meta">
          <span class="tag">{{ vehicle.zone }}</span>
          <span class="tag">{{ vehicle.shift }}</span>
          <span class="tag">载重 {{ vehicle.capacity }} 吨</span>
          <span v-if="vehicle.mileageLocked" class="tag frozen">里程已冻结</span>
        </div>

        <div class="telemetry">
          <label>
            里程（公里）
            <input
              :value="vehicle.mileage"
              type="number"
              min="0"
              :disabled="vehicle.mileageLocked"
              @change="patchTelemetry(vehicle, 'mileage', Number(($event.target as HTMLInputElement).value))"
            />
          </label>
          <label>
            连续驾驶（小时）
            <input
              :value="vehicle.drivingHours"
              type="number"
              min="0"
              step="0.5"
              @change="patchTelemetry(vehicle, 'drivingHours', Number(($event.target as HTMLInputElement).value))"
            />
          </label>
        </div>

        <p v-if="vehicle.drivingHours >= MAX_DRIVING_HOURS" class="warn-line">
          已连续驾驶 {{ vehicle.drivingHours }} 小时，超出 {{ MAX_DRIVING_HOURS }} 小时上限
        </p>

        <p class="bound">
          占用：
          <template v-if="boundTask(vehicle)">
            {{ boundTask(vehicle)!.code }} · {{ boundTask(vehicle)!.name }}
          </template>
          <template v-else>空</template>
        </p>
        <p v-if="vehicle.note" class="note-line">{{ vehicle.note }}</p>

        <div class="actions">
          <button
            v-if="vehicle.mileageLocked"
            type="button"
            class="warn"
            @click="repair(vehicle)"
          >
            维修完成并解冻
          </button>
        </div>
        <p v-if="feedback[vehicle.id]" class="feedback bad">{{ feedback[vehicle.id] }}</p>
      </article>
    </div>
  </section>
</template>

<style scoped>
.vehicle-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}
.vehicle-card {
  border: 1px solid #dfe7f1;
  border-radius: 8px;
  padding: 12px;
  background: #fbfcfe;
}
.driver {
  font-size: 13px;
  font-weight: 500;
  color: #69758c;
  margin-left: 6px;
}
.vehicle-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0;
}
.vehicle-meta .tag {
  border-radius: 999px;
  background: #eef2f7;
  padding: 3px 9px;
  font-size: 12px;
  color: #445069;
}
.vehicle-meta .frozen {
  background: #fdecea;
  color: #b23b26;
}
.telemetry {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.telemetry label {
  font-size: 12px;
  color: #69758c;
}
.telemetry input {
  padding: 7px 9px;
}
.telemetry input:disabled {
  background: #f1f3f7;
  color: #b23b26;
}
.bound {
  margin: 8px 0 4px;
  font-size: 13px;
  color: #536078;
}
.note-line {
  margin: 4px 0;
  font-size: 12px;
  color: #8792a5;
}
.warn-line {
  margin: 6px 0;
  color: #b23b26;
  font-size: 12px;
}
.feedback {
  margin: 6px 0 0;
  font-size: 12px;
}
.feedback.bad {
  color: #b23b26;
}
</style>
