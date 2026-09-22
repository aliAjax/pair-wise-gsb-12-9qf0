import type { DispatchState } from "./types";

// 初始演示数据：覆盖 故障冻结、超重、温区不符、班次不符、连续驾驶超四小时、重复故障升级 等场景。
export function createSeedState(): DispatchState {
  return {
    vehicles: [
      {
        id: "v1",
        plate: "沪A-82L6",
        driver: "董飞",
        zone: "常温",
        shift: "白班",
        capacity: 8,
        mileage: 62140,
        mileageLocked: false,
        drivingHours: 1.5,
        status: "执行中",
        taskId: "t1",
        note: "正在执行任务"
      },
      {
        id: "v2",
        plate: "沪B-73K9",
        driver: "周航",
        zone: "冷藏",
        shift: "白班",
        capacity: 6,
        mileage: 48230,
        mileageLocked: false,
        drivingHours: 4.5,
        status: "空闲",
        taskId: null,
        note: "连续驾驶已超四小时，须休息后再派"
      },
      {
        id: "v3",
        plate: "沪C-19F2",
        driver: "何琳",
        zone: "常温",
        shift: "白班",
        capacity: 5,
        mileage: 31075,
        mileageLocked: false,
        drivingHours: 0.5,
        status: "空闲",
        taskId: null,
        note: "小吨位常温车"
      },
      {
        id: "v4",
        plate: "沪D-60Q8",
        driver: "宋凯",
        zone: "冷冻",
        shift: "白班",
        capacity: 7,
        mileage: 90412,
        mileageLocked: true,
        drivingHours: 2.5,
        status: "故障",
        taskId: null,
        note: "压缩机故障，里程已冻结，等待维修"
      },
      {
        id: "v5",
        plate: "沪E-27M3",
        driver: "沈越",
        zone: "常温",
        shift: "夜班",
        capacity: 10,
        mileage: 25680,
        mileageLocked: false,
        drivingHours: 0,
        status: "空闲",
        taskId: null,
        note: "夜班大车"
      },
      {
        id: "v6",
        plate: "沪F-55T1",
        driver: "罗娜",
        zone: "冷藏",
        shift: "白班",
        capacity: 4,
        mileage: 71390,
        mileageLocked: false,
        drivingHours: 2,
        status: "空闲",
        taskId: null,
        note: "冷藏车，载重偏小"
      },
      {
        id: "v7",
        plate: "沪G-88X5",
        driver: "高岩",
        zone: "冷冻",
        shift: "白班",
        capacity: 9,
        mileage: 12050,
        mileageLocked: false,
        drivingHours: 1,
        status: "空闲",
        taskId: null,
        note: "冷冻新车，可接大票"
      }
    ],
    tasks: [
      {
        id: "t1",
        code: "T2026-0901",
        name: "城北商超补货",
        shift: "白班",
        stops: [
          { id: "t1-s1", name: "城北仓储中心", weight: 5, zone: "常温", done: true },
          { id: "t1-s2", name: "万达广场", weight: 2, zone: "常温", done: false },
          { id: "t1-s3", name: "山姆会员店", weight: 1.5, zone: "常温", done: false }
        ],
        status: "执行中",
        assignedVehicleId: "v1",
        version: 1,
        createdAt: "2026-09-22T07:30:00.000Z"
      },
      {
        id: "t2",
        code: "T2026-0902",
        name: "城东医药冷链",
        shift: "白班",
        stops: [
          { id: "t2-s1", name: "仁济医院", weight: 3.5, zone: "冷藏", done: false },
          { id: "t2-s2", name: "东方医院", weight: 2, zone: "冷藏", done: false }
        ],
        status: "待派",
        assignedVehicleId: null,
        version: 1,
        createdAt: "2026-09-22T08:10:00.000Z"
      },
      {
        id: "t3",
        code: "T2026-0903",
        name: "城南生鲜冷冻",
        shift: "白班",
        stops: [
          { id: "t3-s1", name: "城南冷库", weight: 6.5, zone: "冷冻", done: false },
          { id: "t3-s2", name: "社区生鲜店", weight: 2, zone: "冷冻", done: false }
        ],
        status: "待派",
        assignedVehicleId: null,
        version: 1,
        createdAt: "2026-09-22T08:40:00.000Z"
      },
      {
        id: "t4",
        code: "T2026-0904",
        name: "夜班建材快运",
        shift: "夜班",
        stops: [
          { id: "t4-s1", name: "金山堆场", weight: 8, zone: "常温", done: false }
        ],
        status: "待派",
        assignedVehicleId: null,
        version: 1,
        createdAt: "2026-09-22T09:00:00.000Z"
      }
    ],
    rescues: [],
    rejections: []
  };
}
