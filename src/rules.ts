// 判定层：纯函数规则，不依赖页面与存储。

import type { Store, Task, Vehicle } from "./data";

export const MAX_CONTINUOUS_DRIVING_HOURS = 4;

export function remainingRoute(task: Task): string[] {
  return task.route.slice(task.completedStops);
}

export function findVehicle(store: Store, id: string): Vehicle | undefined {
  return store.vehicles.find((vehicle) => vehicle.id === id);
}

export function findTask(store: Store, id: string): Task | undefined {
  return store.tasks.find((task) => task.id === id);
}

export function taskRescueCount(store: Store, taskId: string): number {
  return store.rescues.filter((rescue) => rescue.taskId === taskId).length;
}

/** 再次故障 = 该任务此前已有故障/转派记录 */
export function isReBreakdown(store: Store, taskId: string): boolean {
  return taskRescueCount(store, taskId) > 0;
}

export type TakeoverVerdict =
  | { kind: "ok" }
  | { kind: "reject"; rule: string } // 整单拒绝：保留原派单
  | { kind: "ineligible"; issues: string[] }; // 校验未通过：可换车再试

/**
 * 接管判定：
 * 1. 司机连续驾驶超 4 小时 → 整单拒绝；
 * 2. 温区不符 → 整单拒绝；
 * 3. 余货重超车辆载重（超重）、班次不符 → 校验未通过，不可接管。
 */
export function evaluateTakeover(vehicle: Vehicle, task: Task): TakeoverVerdict {
  if (vehicle.drivingHours > MAX_CONTINUOUS_DRIVING_HOURS) {
    return {
      kind: "reject",
      rule: `司机连续驾驶 ${vehicle.drivingHours} 小时，超过 ${MAX_CONTINUOUS_DRIVING_HOURS} 小时上限`
    };
  }
  if (vehicle.zone !== task.zone) {
    return {
      kind: "reject",
      rule: `温区不符：货物需 ${task.zone}，车辆为 ${vehicle.zone}`
    };
  }
  const issues: string[] = [];
  if (vehicle.status !== "空闲") {
    issues.push(`车辆当前${vehicle.status}，非空闲`);
  }
  if (task.cargoKg > vehicle.capacityKg) {
    issues.push(`超重：余货重 ${task.cargoKg}kg > 载重 ${vehicle.capacityKg}kg`);
  }
  if (vehicle.shift !== task.shift) {
    issues.push(`班次不符：任务需 ${task.shift}，车辆为 ${vehicle.shift}`);
  }
  return issues.length > 0 ? { kind: "ineligible", issues } : { kind: "ok" };
}

export interface ExceptionItem {
  taskId: string;
  taskName: string;
  vehiclePlate: string;
  category: "超重" | "温区" | "规则";
  detail: string;
}

/** 异常清单：扫描当前在途任务与其占用车辆，列出超重、温区、规则三类异常。 */
export function collectExceptions(store: Store): ExceptionItem[] {
  const items: ExceptionItem[] = [];
  for (const task of store.tasks) {
    if (task.status !== "执行中" && task.status !== "待转派") continue;
    const vehicle = findVehicle(store, task.vehicleId);
    if (!vehicle) {
      items.push({
        taskId: task.id,
        taskName: task.name,
        vehiclePlate: "未指派",
        category: "规则",
        detail: "任务占用车辆不存在"
      });
      continue;
    }
    const base = { taskId: task.id, taskName: task.name, vehiclePlate: vehicle.plate };
    if (task.cargoKg > vehicle.capacityKg) {
      items.push({ ...base, category: "超重", detail: `余货重 ${task.cargoKg}kg 超过载重 ${vehicle.capacityKg}kg` });
    }
    if (vehicle.zone !== task.zone) {
      items.push({ ...base, category: "温区", detail: `货物需 ${task.zone}，车辆为 ${vehicle.zone}` });
    }
    if (vehicle.drivingHours > MAX_CONTINUOUS_DRIVING_HOURS) {
      items.push({
        ...base,
        category: "规则",
        detail: `连续驾驶 ${vehicle.drivingHours} 小时，超过 ${MAX_CONTINUOUS_DRIVING_HOURS} 小时上限`
      });
    }
    if (task.status === "待转派" && vehicle.status !== "故障") {
      items.push({ ...base, category: "规则", detail: "任务待转派但车辆未标记故障，占用不一致" });
    }
  }
  return items;
}

/** 刷新后一致性修复：任务、车辆占用、救援、版本互相对齐。 */
export function reconcile(store: Store): string[] {
  const fixes: string[] = [];
  for (const vehicle of store.vehicles) {
    if (vehicle.status === "执行中") {
      const occupied = store.tasks.some((task) => task.status === "执行中" && task.vehicleId === vehicle.id);
      if (!occupied) {
        vehicle.status = "空闲";
        fixes.push(`车辆 ${vehicle.plate} 无在途任务，占用释放为空闲`);
      }
    }
    if (vehicle.status === "故障") {
      vehicle.mileageKm = Math.round(vehicle.mileageKm); // 冻结里程，不再累计
    }
  }
  for (const task of store.tasks) {
    const vehicle = findVehicle(store, task.vehicleId);
    if (task.status === "执行中" && vehicle && vehicle.status === "空闲") {
      vehicle.status = "执行中";
      fixes.push(`任务 ${task.name} 在途，车辆 ${vehicle.plate} 恢复占用`);
    }
    if (task.status === "待转派" && vehicle && vehicle.status !== "故障") {
      vehicle.status = "故障";
      fixes.push(`任务 ${task.name} 待转派，车辆 ${vehicle.plate} 标记故障并冻结里程`);
    }
    const maxVersion = Math.max(task.version, ...store.rescues.filter((r) => r.taskId === task.id).map((r) => r.version), 1);
    if (task.version !== maxVersion) {
      task.version = maxVersion;
      fixes.push(`任务 ${task.name} 版本对齐为 v${maxVersion}`);
    }
  }
  return fixes;
}
