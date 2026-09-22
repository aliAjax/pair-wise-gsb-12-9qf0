import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { loadState, saveState } from "../data/storage";
import type {
  ActionResult,
  DispatchState,
  Rescue,
  RouteStop,
  Shift,
  Task,
  TempZone,
  Vehicle
} from "../data/types";
import {
  activeStops,
  buildTimeline,
  detectAnomalies,
  evaluateTakeover,
  findVehicle,
  needsEscalation,
  remainingWeight,
  taskRescues,
  uid
} from "../domain/rules";

// store 是数据层与页面层之间的唯一通道：判定仍在 domain 内完成，store 只做状态编排与持久化。
export const useDispatchStore = defineStore("rescue-dispatch", () => {
  const initial = loadState();
  const vehicles = ref<Vehicle[]>(initial.vehicles);
  const tasks = ref<Task[]>(initial.tasks);
  const rescues = ref<Rescue[]>(initial.rescues);
  const rejections = ref<DispatchState["rejections"]>(initial.rejections);

  const state = computed<DispatchState>(() => ({
    vehicles: vehicles.value,
    tasks: tasks.value,
    rescues: rescues.value,
    rejections: rejections.value
  }));

  function persist() {
    saveState(state.value);
  }

  function fail(reasons: string[]): ActionResult {
    return { ok: false, reasons };
  }

  function resetToSeed(next: DispatchState) {
    vehicles.value = next.vehicles;
    tasks.value = next.tasks;
    rescues.value = next.rescues;
    rejections.value = next.rejections;
    persist();
  }

  // ---------- 任务 ----------

  function createTask(input: {
    code: string;
    name: string;
    shift: Shift;
    stops: { name: string; weight: number; zone: TempZone }[];
  }): ActionResult {
    const code = input.code.trim();
    const name = input.name.trim();
    const reasons: string[] = [];
    if (!code) reasons.push("请填写任务单号");
    if (!name) reasons.push("请填写任务名称");
    if (tasks.value.some((task) => task.code === code)) reasons.push(`单号 ${code} 已存在`);
    const stops: RouteStop[] = [];
    input.stops.forEach((stop, index) => {
      if (!stop.name.trim()) reasons.push(`停靠点 ${index + 1} 缺少名称`);
      if (!(stop.weight > 0)) reasons.push(`停靠点 ${index + 1} 货重必须大于 0`);
      stops.push({
        id: uid("s"),
        name: stop.name.trim(),
        weight: Number(stop.weight),
        zone: stop.zone,
        done: false
      });
    });
    if (stops.length === 0) reasons.push("至少添加一个停靠点");
    if (reasons.length > 0) return fail(reasons);

    tasks.value = [
      {
        id: uid("t"),
        code,
        name,
        shift: input.shift,
        stops,
        status: "待派",
        assignedVehicleId: null,
        version: 1,
        createdAt: new Date().toISOString()
      },
      ...tasks.value
    ];
    persist();
    return { ok: true };
  }

  /** 首次派车：同样走余货重 / 温区 / 班次 / 驾驶时长 / 占用校验，失败即拒绝 */
  function assignTask(taskId: string, vehicleId: string): ActionResult {
    const task = tasks.value.find((item) => item.id === taskId);
    const vehicle = vehicles.value.find((item) => item.id === vehicleId);
    if (!task) return fail(["任务不存在"]);
    if (!vehicle) return fail(["车辆不存在"]);
    if (task.status !== "待派" || task.assignedVehicleId) {
      return fail(["任务已派车，如需更换请走故障救援转派"]);
    }

    const check = evaluateTakeover(vehicle, task);
    if (!check.ok) {
      rejections.value = [
        {
          id: uid("r"),
          taskId,
          vehicleId,
          at: new Date().toISOString(),
          reasons: check.reasons
        },
        ...rejections.value
      ];
      persist();
      return fail(check.reasons);
    }

    task.assignedVehicleId = vehicle.id;
    task.status = "执行中";
    vehicle.status = "执行中";
    vehicle.taskId = task.id;
    persist();
    return { ok: true };
  }

  function deliverStop(taskId: string, stopId: string): ActionResult {
    const task = tasks.value.find((item) => item.id === taskId);
    if (!task) return fail(["任务不存在"]);
    const stop = task.stops.find((item) => item.id === stopId);
    if (!stop) return fail(["停靠点不存在"]);
    stop.done = true;
    if (remainingWeight(task) === 0) {
      // 全部送达：收尾并释放车辆占用
      const vehicle = findVehicle(state.value, task.assignedVehicleId);
      task.status = "已完成";
      if (vehicle) {
        vehicle.status = "空闲";
        vehicle.taskId = null;
      }
    }
    persist();
    return { ok: true };
  }

  // ---------- 故障救援与转派 ----------

  /**
   * 上报故障并尝试转派：
   * 1. 再次故障（任务已有救援记录）必须填写升级说明，否则整单拒绝且原派单保留；
   * 2. 接管车必须通过 余货重/温区/班次/连续驾驶/占用 校验，否则整单拒绝、原派单保留；
   * 3. 校验全部通过后原子地：冻结故障车里程并标记故障，写入救援记录（位置/原因/救援费/继承线路），
   *    新车继承剩余线路成为新的执行版本。
   */
  function fileRescue(input: {
    taskId: string;
    rescueVehicleId: string;
    location: string;
    reason: string;
    fee: number;
    escalation: string;
  }): ActionResult {
    const task = tasks.value.find((item) => item.id === input.taskId);
    if (!task) return fail(["任务不存在"]);
    if (task.status !== "执行中" || !task.assignedVehicleId) {
      return fail(["仅执行中的任务可以上报故障转派"]);
    }
    const broken = vehicles.value.find((item) => item.id === task.assignedVehicleId);
    if (!broken) return fail(["原派车辆不存在，占用数据异常"]);
    const rescueVehicle = vehicles.value.find((item) => item.id === input.rescueVehicleId);
    if (!rescueVehicle) return fail(["救援车辆不存在"]);
    if (rescueVehicle.id === broken.id) return fail(["接管车不能与故障车相同"]);

    const reasons: string[] = [];
    if (!input.location.trim()) reasons.push("请填写故障位置");
    if (!input.reason.trim()) reasons.push("请填写故障原因");
    if (!(Number(input.fee) >= 0)) reasons.push("救援费不能为负数");
    if (needsEscalation(state.value, task.id) && !input.escalation.trim()) {
      reasons.push("该任务已发生过救援转派，再次故障必须填写升级说明");
    }
    if (reasons.length > 0) return fail(reasons);

    const check = evaluateTakeover(rescueVehicle, task);
    if (!check.ok) {
      // 整单拒绝：原派单保留，冻结与转派均不发生，仅留拒绝记录
      rejections.value = [
        {
          id: uid("r"),
          taskId: task.id,
          vehicleId: rescueVehicle.id,
          at: new Date().toISOString(),
          reasons: check.reasons
        },
        ...rejections.value
      ];
      persist();
      return fail(check.reasons);
    }

    const version = taskRescues(state.value, task.id).length + 1;
    const inheritedStops = activeStops(task).map((stop) => ({ ...stop }));

    // 故障车：冻结里程、停运并释放占用
    broken.status = "故障";
    broken.mileageLocked = true;
    broken.taskId = null;

    // 救援记录：位置、原因、救援费、冻结里程、继承的剩余线路快照
    const record: Rescue = {
      id: uid("rs"),
      taskId: task.id,
      version,
      fromVehicleId: broken.id,
      toVehicleId: rescueVehicle.id,
      location: input.location.trim(),
      reason: input.reason.trim(),
      fee: Number(input.fee),
      escalation: input.escalation.trim() || undefined,
      frozenMileage: broken.mileage,
      inheritedStops,
      at: new Date().toISOString()
    };
    rescues.value = [record, ...rescues.value];

    // 新车继承剩余线路：已送达点保留完成态，其余点作为接管快照；任务生成新版本
    task.assignedVehicleId = rescueVehicle.id;
    task.version = version + 1;

    rescueVehicle.status = "执行中";
    rescueVehicle.taskId = task.id;

    persist();
    return { ok: true };
  }

  /** 故障车维修完成：里程读数保留，解除冻结，车辆回空闲 */
  function repairVehicle(vehicleId: string): ActionResult {
    const vehicle = vehicles.value.find((item) => item.id === vehicleId);
    if (!vehicle) return fail(["车辆不存在"]);
    if (!vehicle.mileageLocked) return fail(["该车辆里程未冻结，无需维修复位"]);
    vehicle.status = "空闲";
    vehicle.mileageLocked = false;
    vehicle.taskId = null;
    vehicle.drivingHours = 0;
    persist();
    return { ok: true };
  }

  /** 更新里程（冻结时禁止）与连续驾驶时长 */
  function updateVehicleTelemetry(
    vehicleId: string,
    patch: { mileage?: number; drivingHours?: number }
  ): ActionResult {
    const vehicle = vehicles.value.find((item) => item.id === vehicleId);
    if (!vehicle) return fail(["车辆不存在"]);
    if (vehicle.mileageLocked) return fail(["车辆故障，里程已冻结，维修前不可更新"]);
    if (patch.mileage !== undefined) {
      if (!(patch.mileage >= 0) || patch.mileage < vehicle.mileage) {
        return fail(["新里程不能为负且不能小于当前读数"]);
      }
      vehicle.mileage = Number(patch.mileage);
    }
    if (patch.drivingHours !== undefined) {
      if (!(patch.drivingHours >= 0)) return fail(["连续驾驶时长不能为负"]);
      vehicle.drivingHours = Number(patch.drivingHours);
    }
    persist();
    return { ok: true };
  }

  // ---------- 派生视图 ----------

  const anomalies = computed(() => detectAnomalies(state.value));
  const rescueFeeTotal = computed(() =>
    rescues.value.reduce((sum, rescue) => sum + rescue.fee, 0)
  );

  function rescuesOf(taskId: string) {
    return taskRescues(state.value, taskId);
  }

  function timelineOf(task: Task) {
    return buildTimeline(state.value, task);
  }

  return {
    vehicles,
    tasks,
    rescues,
    rejections,
    anomalies,
    rescueFeeTotal,
    createTask,
    assignTask,
    deliverStop,
    fileRescue,
    repairVehicle,
    updateVehicleTelemetry,
    rescuesOf,
    timelineOf,
    resetToSeed
  };
});
