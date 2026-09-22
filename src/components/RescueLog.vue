<script setup lang="ts">
import { useDispatchStore } from "../stores/dispatch";
import { formatTime } from "../domain/rules";

const store = useDispatchStore();

function vehicleName(id: string) {
  const vehicle = store.vehicles.find((item) => item.id === id);
  return vehicle ? vehicle.plate : id;
}

function taskCode(id: string) {
  return store.tasks.find((item) => item.id === id)?.code ?? id;
}
</script>

<template>
  <section class="panel log-panel">
    <div class="toolbar">
      <h2>救援与转派记录</h2>
      <span class="fee">救援费合计 ¥{{ store.rescueFeeTotal }}</span>
    </div>

    <div v-if="store.rescues.length === 0" class="empty">暂无救援记录</div>

    <table v-else class="log-table">
      <thead>
        <tr>
          <th>时间</th>
          <th>任务 / 版本</th>
          <th>故障车 → 接管车</th>
          <th>故障位置</th>
          <th>原因</th>
          <th>冻结里程</th>
          <th>继承剩余线路</th>
          <th>救援费</th>
          <th>升级说明</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="rescue in store.rescues" :key="rescue.id">
          <td>{{ formatTime(rescue.at) }}</td>
          <td>{{ taskCode(rescue.taskId) }}<br /><em>v{{ rescue.version }} → v{{ rescue.version + 1 }}</em></td>
          <td>{{ vehicleName(rescue.fromVehicleId) }} → {{ vehicleName(rescue.toVehicleId) }}</td>
          <td>{{ rescue.location }}</td>
          <td>{{ rescue.reason }}</td>
          <td>{{ rescue.frozenMileage }} km</td>
          <td class="inherit">
            <template v-if="rescue.inheritedStops.length">
              <span v-for="stop in rescue.inheritedStops" :key="stop.id" class="chip">
                {{ stop.name }} {{ stop.weight }}吨/{{ stop.zone }}
              </span>
            </template>
            <template v-else>无（末段故障）</template>
          </td>
          <td>¥{{ rescue.fee }}</td>
          <td>{{ rescue.escalation || "—" }}</td>
        </tr>
      </tbody>
    </table>

    <div v-if="store.rejections.length" class="rejections">
      <h3>整单拒绝记录（原派单保留）</h3>
      <ul>
        <li v-for="rejection in store.rejections" :key="rejection.id">
          {{ formatTime(rejection.at) }} ｜ {{ taskCode(rejection.taskId) }} 尝试由
          {{ vehicleName(rejection.vehicleId) }} 接管被拒：
          <span v-for="(reason, i) in rejection.reasons" :key="i">{{ reason }}<template v-if="i < rejection.reasons.length - 1">；</template></span>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.fee {
  color: #9a5a12;
  font-weight: 700;
  font-size: 13px;
}
.log-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
th,
td {
  border-bottom: 1px solid #e7edf4;
  text-align: left;
  padding: 9px 8px;
  vertical-align: top;
}
th {
  color: #69758c;
  font-weight: 600;
  white-space: nowrap;
}
td em {
  color: #176b87;
  font-style: normal;
  font-size: 12px;
}
.inherit {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.chip {
  background: #eef5fb;
  border-radius: 6px;
  padding: 2px 7px;
  font-size: 12px;
  color: #33506b;
  white-space: nowrap;
}
.rejections {
  margin-top: 14px;
}
.rejections h3 {
  margin: 0 0 8px;
  font-size: 14px;
  color: #b23b26;
}
.rejections ul {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: #536078;
}
</style>
