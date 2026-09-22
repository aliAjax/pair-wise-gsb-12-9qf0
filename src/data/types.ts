// 数据层：领域类型定义。只描述数据形状，不包含任何判定逻辑。

/** 温区：常温 / 冷藏 / 冷冻，决定可承运货物与车辆要求 */
export type TempZone = "常温" | "冷藏" | "冷冻";

/** 班次：白班 / 夜班 */
export type Shift = "白班" | "夜班";

export const VEHICLE_STATUS = ["空闲", "执行中", "故障", "维修"] as const;
export type VehicleStatus = (typeof VEHICLE_STATUS)[number];

export const TASK_STATUS = ["待派", "执行中", "已完成"] as const;
export type TaskStatus = (typeof TASK_STATUS)[number];

/** 车辆：故障后冻结里程（mileageLocked=true），仅在维修后解锁 */
export interface Vehicle {
  id: string;
  plate: string;
  driver: string;
  zone: TempZone;
  shift: Shift;
  /** 额定载重（吨） */
  capacity: number;
  /** 里程表读数（公里），故障时刻冻结 */
  mileage: number;
  /** 里程是否冻结：故障后为 true，维修复位后解锁 */
  mileageLocked: boolean;
  /** 当前连续驾驶时长（小时），交车/维修后清零 */
  drivingHours: number;
  status: VehicleStatus;
  /** 当前执行的任务 id，空闲/故障时为 null */
  taskId: string | null;
  note?: string;
}

/** 线路停靠点 */
export interface RouteStop {
  id: string;
  name: string;
  /** 该点剩余货重（吨），送达后归零 */
  weight: number;
  /** 要求温区 */
  zone: TempZone;
  done: boolean;
}

/** 配送任务（一张订单 = 一单） */
export interface Task {
  id: string;
  code: string;
  name: string;
  shift: Shift;
  stops: RouteStop[];
  status: TaskStatus;
  assignedVehicleId: string | null;
  /** 转派版本号：首次派车为 1，每次救援成功 +1 */
  version: number;
  createdAt: string;
}

/** 故障救援与转派记录 */
export interface Rescue {
  id: string;
  taskId: string;
  /** 救援发生时任务版本（第几次救援 = version - 1） */
  version: number;
  /** 故障车 */
  fromVehicleId: string;
  /** 接管车 */
  toVehicleId: string;
  location: string;
  reason: string;
  /** 救援费（元） */
  fee: number;
  /** 再次故障时必填的升级说明 */
  escalation?: string;
  /** 故障时刻冻结的里程读数 */
  frozenMileage: number;
  /** 新车继承的剩余线路（快照） */
  inheritedStops: RouteStop[];
  at: string;
}

/** 接管失败的整单拒绝记录（原派单保留，不发生转派） */
export interface Rejection {
  id: string;
  taskId: string;
  vehicleId: string;
  at: string;
  reasons: string[];
}

/** 异常分类：任务、车辆、超重、温区、规则 */
export type AnomalyKind = "任务" | "车辆" | "超重" | "温区" | "规则";

export interface Anomaly {
  id: string;
  kind: AnomalyKind;
  title: string;
  detail: string;
}

export interface DispatchState {
  vehicles: Vehicle[];
  tasks: Task[];
  rescues: Rescue[];
  rejections: Rejection[];
}

/** 动作统一返回：成功 ok，失败附带原因列表（供页面提示） */
export type ActionResult = { ok: true } | { ok: false; reasons: string[] };
