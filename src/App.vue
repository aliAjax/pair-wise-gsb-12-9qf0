<script setup lang="ts">
// 页面层：只做交互与渲染，数据在 data.ts，判定在 rules.ts。
import { computed, reactive, ref } from "vue";
import {
  SHIFTS,
  ZONES,
  loadStore,
  saveStore,
  seedStore,
  type Rescue,
  type Store
} from "./data";
import {
  MAX_CONTINUOUS_DRIVING_HOURS,
  collectExceptions,
  evaluateTakeover,
  findTask,
  findVehicle,
  isReBreakdown,
  reconcile,
  remainingRoute
} from "./rules";

const store = ref<Store>(loadStore());
const message = ref("");

// 刷新后一致性：任务、占用、救援、版本对齐
const fixes = reconcile(store.value);
if (fixes.length > 0) {
  saveStore(store.value);
  message.value = `已修复 ${fixes.length} 处不一致：${fixes.join("；")}`;
}

function persist() {
  saveStore(store.value);
}

const vehicles = computed(() => store.value.vehicles);
const tasks = computed(() => store.value.tasks);
const rescues = computed(() => store.value.rescues);
const exceptions = computed(() => collectExceptions(store.value));

const executingTasks = computed(() => tasks.value.filter((task) => task.status === "执行中"));
const pendingTasks = computed(() => tasks.value.filter((task) => task.status === "待转派"));
const idleVehicles = computed(() => vehicles.value.filter((vehicle) => vehicle.status === "空闲"));

const metrics = computed(() => [
  { label: "在途任务", value: executingTasks.value.length },
  { label: "故障车辆", value: vehicles.value.filter((v) => v.status === "故障").length },
  { label: "救援记录", value: rescues.value.length },
  { label: "异常项", value: exceptions.value.length }
]);

function vehiclePlate(id: string) {
  return findVehicle(store.value, id)?.plate ?? "未知车辆";
}

function taskName(id: string) {
  return findTask(store.value, id)?.name ?? "未知任务";
}

/** 待转派任务当前打开的救援单（未接管成功的最近一次故障记录） */
function openRescue(taskId: string): Rescue | undefined {
  return [...rescues.value].reverse().find((rescue) => rescue.taskId === taskId && rescue.result !== "已接管");
}

/* ---------- 故障登记 ---------- */

const breakdownForm = reactive({
  taskId: "",
  location: "",
  cause: "",
  fee: 0,
  escalation: ""
});

const breakdownNeedsEscalation = computed(() => breakdownForm.taskId !== "" && isReBreakdown(store.value, breakdownForm.taskId));

function reportBreakdown() {
  const task = findTask(store.value, breakdownForm.taskId);
  if (!task || task.status !== "执行中") {
    message.value = "仅执行中的任务可登记故障。";
    return;
  }
  const vehicle = findVehicle(store.value, task.vehicleId);
  if (!vehicle) {
    message.value = "任务占用车辆不存在。";
    return;
  }
  const reBreakdown = isReBreakdown(store.value, task.id);
  if (reBreakdown && !breakdownForm.escalation.trim()) {
    message.value = "再次故障必须填写升级说明。";
    return;
  }
  if (reBreakdown) {
    task.version += 1; // 再次故障生成新版本
  }
  vehicle.status = "故障"; // 里程随故障状态冻结
  task.status = "待转派"; // 原派单保留：vehicleId 不变
  store.value.rescues.push({
    id: crypto.randomUUID(),
    taskId: task.id,
    fromVehicleId: vehicle.id,
    toVehicleId: null,
    location: breakdownForm.location,
    cause: breakdownForm.cause,
    fee: Number(breakdownForm.fee) || 0,
    remainingRoute: remainingRoute(task),
    escalation: reBreakdown ? breakdownForm.escalation.trim() : "",
    version: task.version,
    result: "待接管",
    createdAt: new Date().toISOString()
  });
  persist();
  message.value = reBreakdown
    ? `再次故障已升级，任务「${task.name}」生成新版本 v${task.version}，${vehicle.plate} 里程冻结。`
    : `故障已登记，${vehicle.plate} 里程冻结，任务「${task.name}」等待接管。`;
  Object.assign(breakdownForm, { taskId: "", location: "", cause: "", fee: 0, escalation: "" });
}

/* ---------- 接管 / 整单拒绝 ---------- */

function attemptTakeover(taskId: string, vehicleId: string) {
  const task = findTask(store.value, taskId);
  const vehicle = findVehicle(store.value, vehicleId);
  const rescue = openRescue(taskId);
  if (!task || !vehicle || !rescue) return;
  const verdict = evaluateTakeover(vehicle, task);
  if (verdict.kind === "reject") {
    rescue.result = "整单拒绝";
    rescue.toVehicleId = null;
    persist();
    message.value = `整单拒绝：${verdict.rule}。保留原派单 ${vehiclePlate(task.vehicleId)}。`;
    return;
  }
  if (verdict.kind === "ineligible") {
    message.value = `${vehicle.plate} 校验未通过：${verdict.issues.join("；")}`;
    return;
  }
  // 校验通过：新车继承剩余线路
  const oldVehicle = findVehicle(store.value, task.vehicleId);
  task.vehicleId = vehicle.id;
  task.status = "执行中";
  vehicle.status = "执行中";
  rescue.result = "已接管";
  rescue.toVehicleId = vehicle.id;
  rescue.remainingRoute = remainingRoute(task);
  persist();
  message.value = `${vehicle.plate} 接管任务「${task.name}」，继承剩余线路：${rescue.remainingRoute.join(" → ") || "已送完"}${oldVehicle ? `，${oldVehicle.plate} 等待救援` : ""}。`;
}

/* ---------- 在途推进 / 车辆修复 ---------- */

const KM_PER_STOP = 15;
const HOURS_PER_STOP = 0.5;

function completeStop(taskId: string) {
  const task = findTask(store.value, taskId);
  if (!task || task.status !== "执行中") return;
  const vehicle = findVehicle(store.value, task.vehicleId);
  if (!vehicle || vehicle.status === "故障") {
    message.value = "故障车辆里程已冻结，无法继续配送。";
    return;
  }
  task.completedStops += 1;
  vehicle.mileageKm += KM_PER_STOP;
  vehicle.drivingHours = Math.round((vehicle.drivingHours + HOURS_PER_STOP) * 10) / 10;
  if (task.completedStops >= task.route.length) {
    task.status = "已完成";
    vehicle.status = "空闲";
    vehicle.drivingHours = 0;
    message.value = `任务「${task.name}」已完成，${vehicle.plate} 收车。`;
  } else {
    message.value = `任务「${task.name}」到达 ${task.route[task.completedStops - 1]}，剩余 ${remainingRoute(task).length} 站。`;
  }
  persist();
}

function repairVehicle(vehicleId: string) {
  const vehicle = findVehicle(store.value, vehicleId);
  if (!vehicle || vehicle.status !== "故障") return;
  const blocking = tasks.value.find((task) => task.status === "待转派" && task.vehicleId === vehicle.id);
  if (blocking) {
    message.value = `任务「${blocking.name}」仍待转派，请先完成接管或拒绝。`;
    return;
  }
  vehicle.status = "空闲";
  vehicle.drivingHours = 0;
  persist();
  message.value = `${vehicle.plate} 已修复，恢复空闲。`;
}

/* ---------- 新建任务 ---------- */

const taskForm = reactive({
  name: "",
  zone: ZONES[0] as string,
  shift: SHIFTS[0] as string,
  cargoKg: 100,
  vehicleId: "",
  route: ""
});

function createTask() {
  const vehicle = findVehicle(store.value, taskForm.vehicleId);
  if (!vehicle || vehicle.status !== "空闲") {
    message.value = "请选择空闲车辆。";
    return;
  }
  const route = taskForm.route.split(/[，,]/).map((stop) => stop.trim()).filter(Boolean);
  if (route.length === 0) {
    message.value = "请填写线路站点。";
    return;
  }
  const verdict = evaluateTakeover(vehicle, {
    id: "",
    name: taskForm.name,
    zone: taskForm.zone,
    shift: taskForm.shift,
    cargoKg: Number(taskForm.cargoKg) || 0,
    route,
    completedStops: 0,
    vehicleId: vehicle.id,
    status: "执行中",
    version: 1
  });
  if (verdict.kind !== "ok") {
    message.value = verdict.kind === "reject" ? `整单拒绝：${verdict.rule}` : `校验未通过：${verdict.issues.join("；")}`;
    return;
  }
  store.value.tasks.unshift({
    id: crypto.randomUUID(),
    name: taskForm.name,
    zone: taskForm.zone,
    shift: taskForm.shift,
    cargoKg: Number(taskForm.cargoKg) || 0,
    route,
    completedStops: 0,
    vehicleId: vehicle.id,
    status: "执行中",
    version: 1
  });
  vehicle.status = "执行中";
  persist();
  message.value = `任务「${taskForm.name}」已派给 ${vehicle.plate}。`;
  Object.assign(taskForm, { name: "", zone: ZONES[0], shift: SHIFTS[0], cargoKg: 100, vehicleId: "", route: "" });
}

function resetAll() {
  store.value = seedStore();
  persist();
  message.value = "已重置为演示数据。";
}
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">物流行业前端最小闭环</p>
          <h1>故障救援与转派台</h1>
          <p class="subtitle">
            车辆故障后冻结里程，仅余货重、温区、班次校验通过的车辆可接管并继承剩余线路；
            司机连续驾驶超 {{ MAX_CONTINUOUS_DRIVING_HOURS }} 小时或温区不符时整单拒绝并保留原派单；
            再次故障须写升级说明并生成新版本。
          </p>
        </div>
        <div class="stack">
          <span class="tag">Vue3</span>
          <span class="tag">TypeScript</span>
          <span class="tag">localStorage</span>
        </div>
      </header>

      <section class="metrics">
        <article v-for="metric in metrics" :key="metric.label" class="metric">
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
        </article>
      </section>

      <p v-if="message" class="banner">{{ message }}</p>

      <section class="workspace">
        <div class="side">
          <form class="panel" @submit.prevent="reportBreakdown">
            <h2>故障登记</h2>
            <div class="form-grid">
              <label>
                在途任务
                <select v-model="breakdownForm.taskId" required>
                  <option value="">请选择</option>
                  <option v-for="task in executingTasks" :key="task.id" :value="task.id">
                    {{ task.name }} / {{ vehiclePlate(task.vehicleId) }} / v{{ task.version }}
                  </option>
                </select>
              </label>
              <label>
                故障位置
                <input v-model="breakdownForm.location" placeholder="如：沪青平公路近诸光路" required />
              </label>
              <label>
                故障原因
                <input v-model="breakdownForm.cause" placeholder="如：发动机高温报警" required />
              </label>
              <label>
                救援费（元）
                <input v-model.number="breakdownForm.fee" type="number" min="0" required />
              </label>
              <label v-if="breakdownNeedsEscalation">
                升级说明（再次故障必填）
                <textarea v-model="breakdownForm.escalation" placeholder="说明再次故障原因与升级处理方案" />
              </label>
              <button type="submit">登记故障并冻结里程</button>
            </div>
          </form>

          <form class="panel" @submit.prevent="createTask">
            <h2>新建任务</h2>
            <div class="form-grid">
              <label>
                任务名称
                <input v-model="taskForm.name" placeholder="如：商超补货" required />
              </label>
              <label>
                温区
                <select v-model="taskForm.zone">
                  <option v-for="zone in ZONES" :key="zone">{{ zone }}</option>
                </select>
              </label>
              <label>
                班次
                <select v-model="taskForm.shift">
                  <option v-for="shift in SHIFTS" :key="shift">{{ shift }}</option>
                </select>
              </label>
              <label>
                货重（kg）
                <input v-model.number="taskForm.cargoKg" type="number" min="1" required />
              </label>
              <label>
                派车（空闲）
                <select v-model="taskForm.vehicleId" required>
                  <option value="">请选择</option>
                  <option v-for="vehicle in idleVehicles" :key="vehicle.id" :value="vehicle.id">
                    {{ vehicle.plate }} / {{ vehicle.driver }} / {{ vehicle.zone }} / {{ vehicle.shift }} / 载重{{ vehicle.capacityKg }}kg
                  </option>
                </select>
              </label>
              <label>
                线路站点（逗号分隔）
                <input v-model="taskForm.route" placeholder="如：青浦仓,城北门店,城东门店" required />
              </label>
              <button type="submit">派车执行</button>
            </div>
          </form>
        </div>

        <section class="list-panel">
          <div class="toolbar">
            <h2>转派与在途</h2>
            <button class="secondary" type="button" @click="resetAll">重置演示数据</button>
          </div>

          <div v-if="pendingTasks.length > 0" class="record-grid">
            <article v-for="task in pendingTasks" :key="task.id" class="record urgent">
              <div class="record-head">
                <p class="record-title">{{ task.name }} · v{{ task.version }}</p>
                <span class="status warn">待转派</span>
              </div>
              <div class="details">
                <span>原派单: {{ vehiclePlate(task.vehicleId) }}（保留中）</span>
                <span>余货重: {{ task.cargoKg }}kg</span>
                <span>温区: {{ task.zone }}</span>
                <span>班次: {{ task.shift }}</span>
                <span>剩余线路: {{ remainingRoute(task).join(" → ") || "无" }}</span>
                <span v-if="openRescue(task.id)">救援费: {{ openRescue(task.id)!.fee }} 元</span>
              </div>
              <p v-if="openRescue(task.id)" class="note">
                故障：{{ openRescue(task.id)!.location }} / {{ openRescue(task.id)!.cause }}
                <template v-if="openRescue(task.id)!.escalation">；升级说明：{{ openRescue(task.id)!.escalation }}</template>
              </p>
              <div class="candidate-grid">
                <div v-for="vehicle in vehicles" :key="vehicle.id" class="candidate">
                  <span>{{ vehicle.plate }} / {{ vehicle.driver }} / {{ vehicle.zone }} / {{ vehicle.shift }} / 载重{{ vehicle.capacityKg }}kg / 连续驾驶{{ vehicle.drivingHours }}h</span>
                  <button
                    v-if="evaluateTakeover(vehicle, task).kind === 'ok'"
                    type="button"
                    @click="attemptTakeover(task.id, vehicle.id)"
                  >接管</button>
                  <button
                    v-else-if="evaluateTakeover(vehicle, task).kind === 'reject'"
                    class="danger"
                    type="button"
                    @click="attemptTakeover(task.id, vehicle.id)"
                  >整单拒绝</button>
                  <span v-else class="ineligible">不可接管</span>
                </div>
              </div>
            </article>
          </div>
          <div v-else class="empty">暂无待转派任务</div>

          <h2 class="section-title">任务列表</h2>
          <div class="record-grid">
            <article v-for="task in tasks" :key="task.id" class="record">
              <div class="record-head">
                <p class="record-title">{{ task.name }} · v{{ task.version }}</p>
                <span class="status">{{ task.status }}</span>
              </div>
              <div class="details">
                <span>车辆: {{ vehiclePlate(task.vehicleId) }}</span>
                <span>余货重: {{ task.cargoKg }}kg</span>
                <span>温区: {{ task.zone }}</span>
                <span>班次: {{ task.shift }}</span>
                <span>进度: {{ task.completedStops }}/{{ task.route.length }} 站</span>
                <span>剩余线路: {{ remainingRoute(task).join(" → ") || "已送完" }}</span>
              </div>
              <div class="actions">
                <button v-if="task.status === '执行中'" type="button" @click="completeStop(task.id)">完成一站</button>
              </div>
            </article>
          </div>

          <h2 class="section-title">车辆占用</h2>
          <div class="record-grid">
            <article v-for="vehicle in vehicles" :key="vehicle.id" class="record">
              <div class="record-head">
                <p class="record-title">{{ vehicle.plate }} / {{ vehicle.driver }}</p>
                <span class="status" :class="{ warn: vehicle.status === '故障' }">{{ vehicle.status }}</span>
              </div>
              <div class="details">
                <span>温区: {{ vehicle.zone }}</span>
                <span>班次: {{ vehicle.shift }}</span>
                <span>载重: {{ vehicle.capacityKg }}kg</span>
                <span>连续驾驶: {{ vehicle.drivingHours }}h</span>
                <span>里程: {{ vehicle.mileageKm }}km{{ vehicle.status === "故障" ? "（已冻结）" : "" }}</span>
              </div>
              <div class="actions">
                <button v-if="vehicle.status === '故障'" class="secondary" type="button" @click="repairVehicle(vehicle.id)">修复完成</button>
              </div>
            </article>
          </div>

          <h2 class="section-title">救援记录</h2>
          <div v-if="rescues.length === 0" class="empty">暂无救援记录</div>
          <div v-else class="record-grid">
            <article v-for="rescue in [...rescues].reverse()" :key="rescue.id" class="record">
              <div class="record-head">
                <p class="record-title">{{ taskName(rescue.taskId) }} · v{{ rescue.version }}</p>
                <span class="status" :class="{ warn: rescue.result !== '已接管' }">{{ rescue.result }}</span>
              </div>
              <div class="details">
                <span>故障位置: {{ rescue.location }}</span>
                <span>故障原因: {{ rescue.cause }}</span>
                <span>救援费: {{ rescue.fee }} 元</span>
                <span>故障车: {{ vehiclePlate(rescue.fromVehicleId) }}</span>
                <span>接班车: {{ rescue.toVehicleId ? vehiclePlate(rescue.toVehicleId) : "无（保留原派单）" }}</span>
                <span>剩余线路: {{ rescue.remainingRoute.join(" → ") || "无" }}</span>
              </div>
              <p v-if="rescue.escalation" class="note">升级说明：{{ rescue.escalation }}</p>
            </article>
          </div>

          <h2 class="section-title">异常清单</h2>
          <div v-if="exceptions.length === 0" class="empty">暂无异常</div>
          <div v-else class="record-grid">
            <article v-for="(item, index) in exceptions" :key="index" class="record">
              <div class="record-head">
                <p class="record-title">{{ item.taskName }} / {{ item.vehiclePlate }}</p>
                <span class="status warn">{{ item.category }}</span>
              </div>
              <p class="note">{{ item.detail }}</p>
            </article>
          </div>
        </section>
      </section>
    </div>
  </main>
</template>
