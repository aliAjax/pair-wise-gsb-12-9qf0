<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useDispatchStore } from "../stores/dispatch";
import { evaluateTakeover, needsEscalation, remainingWeight } from "../domain/rules";

const props = defineProps<{ taskId: string | null }>();
const emit = defineEmits<{ (event: "close"): void }>();

const store = useDispatchStore();

const form = reactive({
  rescueVehicleId: "",
  location: "",
  reason: "",
  fee: 300,
  escalation: ""
});
const feedback = ref<{ ok: boolean; text: string } | null>(null);

const task = computed(() => store.tasks.find((item) => item.id === props.taskId) ?? null);
const broken = computed(() =>
  store.vehicles.find((vehicle) => vehicle.id === task.value?.assignedVehicleId) ?? null
);
const rescueVehicle = computed(() =>
  store.vehicles.find((vehicle) => vehicle.id === form.rescueVehicleId) ?? null
);
const repeatFailure = computed(() => (task.value ? needsEscalation(store, task.value.id) : false));
const preview = computed(() =>
  task.value && rescueVehicle.value ? evaluateTakeover(rescueVehicle.value, task.value) : null
);
const candidates = computed(() => {
  if (!task.value) return [];
  return store.vehicles.filter((vehicle) => vehicle.id !== task.value!.assignedVehicleId);
});

watch(
  () => props.taskId,
  () => {
    form.rescueVehicleId = "";
    form.location = "";
    form.reason = "";
    form.fee = 300;
    form.escalation = "";
    feedback.value = null;
  }
);

function submit() {
  if (!task.value) return;
  const result = store.fileRescue({
    taskId: task.value.id,
    rescueVehicleId: form.rescueVehicleId,
    location: form.location,
    reason: form.reason,
    fee: Number(form.fee),
    escalation: form.escalation
  });
  if (result.ok) {
    feedback.value = {
      ok: true,
      text: `转派成功：故障车里程已冻结，新车继承剩余线路，任务升级为 v${task.value.version}，救援记录已保存`
    };
    form.rescueVehicleId = "";
    form.location = "";
    form.reason = "";
    form.fee = 300;
    form.escalation = "";
  } else {
    feedback.value = { ok: false, text: `整单拒绝，原派单保留：${result.reasons.join("；")}` };
  }
}
</script>

<template>
  <section v-if="task" class="panel rescue-panel">
    <div class="rescue-head">
      <h2>故障救援与转派台</h2>
      <button type="button" class="secondary" @click="emit('close')">收起</button>
    </div>

    <div class="rescue-target">
      <p>
        故障任务：<strong>{{ task.code }} · {{ task.name }}</strong>
        （{{ task.shift }}，当前 v{{ task.version }}，剩余货重 {{ remainingWeight(task) }} 吨）
      </p>
      <p v-if="broken">
        故障车：<strong>{{ broken.plate }} / {{ broken.driver }}</strong>，
        里程读数 <strong>{{ broken.mileage }} 公里</strong>
        <em>将在转派成功瞬间冻结</em>；连续驾驶 {{ broken.drivingHours }} 小时。
      </p>
      <p v-if="repeatFailure" class="warn-banner">
        该任务已有 {{ store.rescuesOf(task.id).length }} 次救援记录，再次故障必须填写升级说明，否则整单拒绝。
      </p>
    </div>

    <form class="form-grid" @submit.prevent="submit">
      <label>
        故障位置
        <input v-model="form.location" placeholder="如 中环高架金沙江路出口 200 米" required />
      </label>
      <label>
        故障原因
        <input v-model="form.reason" placeholder="如 发动机水温过高、轮胎爆裂" required />
      </label>
      <div class="two-col">
        <label>
          救援费（元）
          <input v-model.number="form.fee" type="number" min="0" step="10" required />
        </label>
        <label>
          接管车辆
          <select v-model="form.rescueVehicleId" required>
            <option value="">选择救援车…</option>
            <option v-for="vehicle in candidates" :key="vehicle.id" :value="vehicle.id">
              {{ vehicle.plate }} {{ vehicle.driver }} · {{ vehicle.zone }} · 载重{{ vehicle.capacity }}吨
              · {{ vehicle.shift }} · 已驾驶{{ vehicle.drivingHours }}h
            </option>
          </select>
        </label>
      </div>

      <label v-if="repeatFailure">
        升级说明（再次故障必填，将写入新版本记录）
        <textarea
          v-model="form.escalation"
          placeholder="说明重复故障的升级处理：如调度主管已到场、改派冷链备用车、客户已通知等"
        />
      </label>

      <ul v-if="preview" class="checks">
        <li v-for="(reason, i) in preview.reasons" :key="i" class="bad">✗ {{ reason }}</li>
        <li v-if="preview.ok" class="ok">
          ✓ 余货重 {{ remainingWeight(task) }} 吨、温区、班次、连续驾驶、车辆占用全部通过，可接管
        </li>
      </ul>

      <p v-if="feedback" :class="['feedback', feedback.ok ? 'ok' : 'bad']">{{ feedback.text }}</p>

      <button type="submit" :disabled="!form.rescueVehicleId || preview?.ok === false">
        冻结里程并执行转派
      </button>
      <p class="hint">任一项校验不通过都将整单拒绝，原派单与原里程保持不变，仅登记拒绝原因。</p>
    </form>
  </section>
</template>

<style scoped>
.rescue-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.rescue-head h2 {
  margin: 0;
}
.rescue-target {
  background: #f6f8fb;
  border: 1px solid #dfe7f1;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
  font-size: 13px;
  color: #536078;
}
.rescue-target p {
  margin: 4px 0;
}
.rescue-target em {
  font-style: normal;
  color: #b23b26;
}
.warn-banner {
  background: #fff5e6 !important;
  border-radius: 6px;
  padding: 6px 8px !important;
  color: #9a5a12 !important;
}
.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.checks {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  display: grid;
  gap: 4px;
}
.checks .ok {
  color: #14724f;
}
.checks .bad {
  color: #b23b26;
}
.feedback {
  margin: 0;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 13px;
}
.feedback.ok {
  background: #e8f4ef;
  color: #14724f;
}
.feedback.bad {
  background: #fdecea;
  color: #b23b26;
}
.hint {
  margin: 0;
  font-size: 12px;
  color: #8792a5;
}
</style>
