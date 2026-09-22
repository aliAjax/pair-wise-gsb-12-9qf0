<script setup lang="ts">
import { reactive, ref } from "vue";
import { useDispatchStore } from "../stores/dispatch";
import type { Shift, TempZone } from "../data/types";

const store = useDispatchStore();
const ZONES: TempZone[] = ["常温", "冷藏", "冷冻"];
const SHIFTS: Shift[] = ["白班", "夜班"];

const form = reactive({
  code: "",
  name: "",
  shift: "白班" as Shift,
  stops: [{ name: "", weight: 1, zone: "常温" as TempZone }]
});
const feedback = ref<{ ok: boolean; text: string } | null>(null);

function addStop() {
  form.stops.push({ name: "", weight: 1, zone: form.stops[0]?.zone ?? "常温" });
}

function removeStop(index: number) {
  form.stops.splice(index, 1);
}

function submit() {
  const result = store.createTask({ ...form });
  if (result.ok) {
    feedback.value = { ok: true, text: `任务 ${form.code} 已创建，等待派车` };
    form.code = "";
    form.name = "";
    form.shift = "白班";
    form.stops = [{ name: "", weight: 1, zone: "常温" }];
  } else {
    feedback.value = { ok: false, text: result.reasons.join("；") };
  }
}
</script>

<template>
  <form class="panel" @submit.prevent="submit">
    <h2>新增配送任务</h2>
    <div class="form-grid">
      <label>
        任务单号
        <input v-model="form.code" placeholder="如 T2026-0905" required />
      </label>
      <label>
        任务名称
        <input v-model="form.name" placeholder="如 城北商超补货" required />
      </label>
      <label>
        班次
        <select v-model="form.shift">
          <option v-for="shift in SHIFTS" :key="shift" :value="shift">{{ shift }}</option>
        </select>
      </label>

      <div class="stop-editor">
        <div class="stop-head">
          <span>线路停靠点（货重 / 温区）</span>
          <button type="button" class="secondary" @click="addStop">+ 停靠点</button>
        </div>
        <div v-for="(stop, index) in form.stops" :key="index" class="stop-row">
          <input v-model="stop.name" placeholder="停靠点名称" required />
          <input v-model.number="stop.weight" type="number" min="0.1" step="0.1" title="货重（吨）" />
          <select v-model="stop.zone">
            <option v-for="zone in ZONES" :key="zone" :value="zone">{{ zone }}</option>
          </select>
          <button type="button" class="danger" :disabled="form.stops.length === 1" @click="removeStop(index)">
            删
          </button>
        </div>
      </div>

      <p v-if="feedback" :class="['feedback', feedback.ok ? 'ok' : 'bad']">{{ feedback.text }}</p>
      <button type="submit">创建任务</button>
    </div>
  </form>
</template>

<style scoped>
.stop-editor {
  display: grid;
  gap: 8px;
}
.stop-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #445069;
  font-size: 14px;
}
.stop-row {
  display: grid;
  grid-template-columns: 1fr 92px 84px 48px;
  gap: 8px;
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
</style>
