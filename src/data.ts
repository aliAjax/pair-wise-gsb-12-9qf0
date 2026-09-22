// 数据层：类型、种子数据、本地持久化。不含判定逻辑。

export type VehicleStatus = "空闲" | "执行中" | "故障";
export type TaskStatus = "待派" | "执行中" | "待转派" | "已完成";
export type RescueResult = "待接管" | "已接管" | "整单拒绝";

export interface Vehicle {
  id: string;
  plate: string;
  driver: string;
  zone: string; // 温区：常温 / 冷藏 / 冷冻
  shift: string; // 班次：早班 / 中班 / 晚班
  capacityKg: number;
  mileageKm: number; // 故障后冻结，不再增长
  drivingHours: number; // 连续驾驶时长（小时）
  status: VehicleStatus;
}

export interface Task {
  id: string;
  name: string;
  zone: string; // 货物所需温区
  shift: string; // 要求班次
  cargoKg: number; // 余货重（待配送货重）
  route: string[]; // 完整线路
  completedStops: number; // 已完成站点数，剩余线路 = route.slice(completedStops)
  vehicleId: string; // 当前派单车辆（原派单保留时也指向它）
  status: TaskStatus;
  version: number; // 再次故障时 +1，生成新版本
}

export interface Rescue {
  id: string;
  taskId: string;
  fromVehicleId: string; // 故障车
  toVehicleId: string | null; // 接班车，整单拒绝/待接管时为 null
  location: string; // 故障位置
  cause: string; // 故障原因
  fee: number; // 救援费（元）
  remainingRoute: string[]; // 故障时点的剩余线路快照
  escalation: string; // 再次故障时的升级说明
  version: number; // 本次故障对应的任务版本
  result: RescueResult;
  createdAt: string;
}

export interface Store {
  vehicles: Vehicle[];
  tasks: Task[];
  rescues: Rescue[];
}

export const STORAGE_KEY = "dfwlfront-3-rescue";

export const ZONES = ["常温", "冷藏", "冷冻"] as const;
export const SHIFTS = ["早班", "中班", "晚班"] as const;

export function seedStore(): Store {
  return {
    vehicles: [
      { id: "v1", plate: "沪A-82L6", driver: "董飞", zone: "常温", shift: "早班", capacityKg: 1200, mileageKm: 18320, drivingHours: 1.5, status: "执行中" },
      { id: "v2", plate: "沪B-73K9", driver: "周航", zone: "冷藏", shift: "早班", capacityKg: 900, mileageKm: 24105, drivingHours: 2, status: "执行中" },
      { id: "v3", plate: "沪C-51M2", driver: "吴洁", zone: "冷藏", shift: "中班", capacityKg: 1000, mileageKm: 15740, drivingHours: 0.5, status: "空闲" },
      { id: "v4", plate: "沪D-66Q8", driver: "郑凯", zone: "冷冻", shift: "晚班", capacityKg: 1500, mileageKm: 30980, drivingHours: 4.5, status: "空闲" },
      { id: "v5", plate: "沪E-09R3", driver: "林岚", zone: "常温", shift: "早班", capacityKg: 800, mileageKm: 9870, drivingHours: 0, status: "空闲" }
    ],
    tasks: [
      {
        id: "t1",
        name: "商超补货",
        zone: "常温",
        shift: "早班",
        cargoKg: 760,
        route: ["青浦仓", "城北门店", "城东门店", "城南门店"],
        completedStops: 1,
        vehicleId: "v1",
        status: "执行中",
        version: 1
      },
      {
        id: "t2",
        name: "医药配送",
        zone: "冷藏",
        shift: "早班",
        cargoKg: 420,
        route: ["冷链仓", "仁和药房", "市一医院"],
        completedStops: 0,
        vehicleId: "v2",
        status: "执行中",
        version: 1
      }
    ],
    rescues: []
  };
}

export function loadStore(): Store {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return seedStore();
  try {
    const parsed = JSON.parse(raw) as Store;
    if (!Array.isArray(parsed.vehicles) || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.rescues)) {
      return seedStore();
    }
    return parsed;
  } catch {
    return seedStore();
  }
}

export function saveStore(store: Store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}
