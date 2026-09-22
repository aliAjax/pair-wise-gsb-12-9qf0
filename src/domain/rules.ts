import type {
  Anomaly,
  DispatchState,
  Rescue,
  RouteStop,
  Task,
  Vehicle
} from "../data/types";

// 判定层：全部为纯函数，不读写 store / localStorage / DOM，页面层只负责调用与展示。

export const MAX_DRIVING_HOURS = 4;

export function uid(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

/** 未送达停靠点 */
export function activeStops(task: Task): RouteStop[] {
  return task.stops.filter((stop) => !stop.done);
}

/** 剩余货重（吨）：仅统计未送达停靠点 */
export function remainingWeight(task: Task): number {
  return activeStops(task).reduce((sum, stop) => sum + stop.weight, 0);
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export interface CheckResult {
  ok: boolean;
  reasons: string[];
}

/**
 * 判断车辆能否接管任务（也用于首次派车校验）。
 * 规则：车辆空闲未占用、里程未冻结、余货重不超额定载重、温区逐点相符、班次一致、
 * 连续驾驶不超过四小时。任一项不过即整单拒绝。
 */
export function evaluateTakeover(vehicle: Vehicle, task: Task): CheckResult {
  const reasons: string[] = [];
  const rest = remainingWeight(task);

  if (vehicle.status !== "空闲" || vehicle.taskId !== null) {
    reasons.push(`车辆被占用（当前${vehicle.status}），无法接管`);
  }
  if (vehicle.mileageLocked) {
    reasons.push("车辆里程已冻结（故障未修复），不能派车");
  }
  if (rest > vehicle.capacity) {
    reasons.push(`余货重 ${rest} 吨超过额定载重 ${vehicle.capacity} 吨（超重）`);
  }
  const mismatched = activeStops(task).filter((stop) => stop.zone !== vehicle.zone);
  if (mismatched.length > 0) {
    reasons.push(
      `温区不符：任务要求 ${mismatched
        .map((stop) => stop.zone)
        .filter((zone, index, arr) => arr.indexOf(zone) === index)
        .join("/")}，车辆为 ${vehicle.zone}`
    );
  }
  if (vehicle.shift !== task.shift) {
    reasons.push(`班次不符：任务为${task.shift}，车辆为${vehicle.shift}`);
  }
  if (vehicle.drivingHours >= MAX_DRIVING_HOURS) {
    reasons.push(
      `司机已连续驾驶 ${vehicle.drivingHours} 小时，超过 ${MAX_DRIVING_HOURS} 小时须休息`
    );
  }

  return { ok: reasons.length === 0, reasons };
}

/** 该任务是否已有过成功救援（再次故障必须填写升级说明） */
export function taskRescues(state: DispatchState, taskId: string): Rescue[] {
  return state.rescues
    .filter((rescue) => rescue.taskId === taskId)
    .sort((a, b) => a.version - b.version);
}

export function needsEscalation(state: DispatchState, taskId: string): boolean {
  return taskRescues(state, taskId).length >= 1;
}

export function findVehicle(state: DispatchState, id: string | null): Vehicle | undefined {
  return state.vehicles.find((vehicle) => vehicle.id === id);
}

/** 版本时间线：首次派车 + 每次救援转派生成的新版本 */
export interface TimelineEntry {
  version: number;
  label: string;
  vehiclePlate?: string;
  at: string;
  rescue?: Rescue;
}

export function buildTimeline(state: DispatchState, task: Task): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const rescues = taskRescues(state, task.id);
  if (rescues.length > 0) {
    const first = rescues[0];
    const firstVehicle = findVehicle(state, first.fromVehicleId);
    entries.push({
      version: 1,
      label: "首次派车",
      vehiclePlate: firstVehicle?.plate,
      at: task.createdAt
    });
    for (const rescue of rescues) {
      const to = findVehicle(state, rescue.toVehicleId);
      entries.push({
        version: rescue.version + 1,
        label: `救援转派 v${rescue.version + 1}`,
        vehiclePlate: to?.plate,
        at: rescue.at,
        rescue
      });
    }
  } else {
    const vehicle = findVehicle(state, task.assignedVehicleId);
    entries.push({
      version: 1,
      label: task.assignedVehicleId ? "首次派车" : "尚未派车",
      vehiclePlate: vehicle?.plate,
      at: task.createdAt
    });
  }
  return entries;
}

/**
 * 异常清单：任务 / 车辆 / 超重 / 温区 / 规则 五类。
 * 由当前状态与拒绝记录直接派生，刷新后仍然一致。
 */
export function detectAnomalies(state: DispatchState): Anomaly[] {
  const anomalies: Anomaly[] = [];

  for (const task of state.tasks) {
    const vehicle = findVehicle(state, task.assignedVehicleId);
    const rest = remainingWeight(task);

    if (task.status === "待派") {
      anomalies.push({
        id: `a-task-${task.id}-pending`,
        kind: "任务",
        title: `${task.code} ${task.name} 待派车`,
        detail: `任务尚未分配车辆，剩余货重 ${rest} 吨（${task.shift}）`
      });
    }

    if (task.status === "执行中") {
      if (!task.assignedVehicleId || !vehicle) {
        anomalies.push({
          id: `a-task-${task.id}-orphan`,
          kind: "任务",
          title: `${task.code} 执行中但无有效车辆`,
          detail: "任务占用与车辆占用不一致，需要重新派车"
        });
      } else {
        // 占用一致性：任务与车辆必须互相指向
        if (vehicle.taskId !== task.id || vehicle.status !== "执行中") {
          anomalies.push({
            id: `a-task-${task.id}-occupied`,
            kind: "任务",
            title: `${task.code} 占用不一致`,
            detail: `任务标记由 ${vehicle.plate} 执行，但车辆状态为「${vehicle.status}」、占用任务为 ${vehicle.taskId ?? "空"}`
          });
        }
        if (rest > vehicle.capacity) {
          anomalies.push({
            id: `a-overweight-${task.id}`,
            kind: "超重",
            title: `${task.code} 余货超重`,
            detail: `${vehicle.plate} 额定载重 ${vehicle.capacity} 吨，剩余货重 ${rest} 吨`
          });
        }
        const mismatched = activeStops(task).filter((stop) => stop.zone !== vehicle.zone);
        if (mismatched.length > 0) {
          anomalies.push({
            id: `a-zone-${task.id}`,
            kind: "温区",
            title: `${task.code} 温区不符`,
            detail: `${vehicle.plate} 为${vehicle.zone}车，仍有 ${mismatched
              .map((stop) => `${stop.name}(${stop.zone})`)
              .join("、")} 温区不一致`
          });
        }
      }
    }

    // 全部送达但任务未收尾
    if (task.status !== "已完成" && task.stops.length > 0 && rest === 0) {
      anomalies.push({
        id: `a-task-${task.id}-finish`,
        kind: "任务",
        title: `${task.code} 可完结`,
        detail: "所有停靠点已送达，等待标记完成"
      });
    }
  }

  for (const vehicle of state.vehicles) {
    if (vehicle.status === "故障") {
      anomalies.push({
        id: `a-vehicle-${vehicle.id}-broken`,
        kind: "车辆",
        title: `${vehicle.plate} 故障停运`,
        detail: `里程冻结于 ${vehicle.mileage} 公里${vehicle.note ? `：${vehicle.note}` : ""}`
      });
    }
    if (vehicle.mileageLocked && vehicle.status !== "故障" && vehicle.status !== "维修") {
      anomalies.push({
        id: `a-vehicle-${vehicle.id}-lock`,
        kind: "车辆",
        title: `${vehicle.plate} 里程冻结状态异常`,
        detail: `车辆为「${vehicle.status}」但里程仍处于冻结状态`
      });
    }
    if (vehicle.status === "执行中") {
      if (!vehicle.taskId) {
        anomalies.push({
          id: `a-vehicle-${vehicle.id}-ghost`,
          kind: "车辆",
          title: `${vehicle.plate} 占用缺失`,
          detail: "车辆状态为执行中，但未关联任何任务"
        });
      } else if (vehicle.drivingHours >= MAX_DRIVING_HOURS) {
        anomalies.push({
          id: `a-rule-${vehicle.id}-driving`,
          kind: "规则",
          title: `${vehicle.plate} 连续驾驶超限`,
          detail: `司机 ${vehicle.driver} 已连续驾驶 ${vehicle.drivingHours} 小时，须立即换班或救援转派`
        });
      }
    }

    const boundTask = state.tasks.find((task) => task.id === vehicle.taskId);
    if (vehicle.taskId && (!boundTask || boundTask.status === "已完成")) {
      anomalies.push({
        id: `a-vehicle-${vehicle.id}-stale`,
        kind: "规则",
        title: `${vehicle.plate} 占用了已结束任务`,
        detail: `任务 ${vehicle.taskId} 已完成或不存在，但车辆未释放`
      });
    }
  }

  // 整单拒绝记录属于规则异常：原派单保留、接管未发生
  for (const rejection of state.rejections) {
    const task = state.tasks.find((item) => item.id === rejection.taskId);
    const vehicle = findVehicle(state, rejection.vehicleId);
    anomalies.push({
      id: `a-rule-reject-${rejection.id}`,
      kind: "规则",
      title: `${task?.code ?? rejection.taskId} 转派被整单拒绝`,
      detail: `${vehicle?.plate ?? rejection.vehicleId} 不符合接管条件（${rejection.reasons.join(
        "；"
      )}），原派单保留`
    });
  }

  return anomalies;
}
