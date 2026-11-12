import { customers, depots, vehicleTypes, vehicles } from './mock-data';
import type { VrpScenario } from './types';

function timeToSeconds(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 3600 + minutes * 60;
}

function windowToApi(value: string) {
  const [start, end] = value.split('–');
  return { start: timeToSeconds(start), end: timeToSeconds(end) };
}

export const sampleScenario: VrpScenario = {
  schema_version: '1.0',
  name: 'Berlin pilot',
  description: 'Operartis VRP demonstration scenario',
  planning_date: '2026-08-24',
  timezone: 'Europe/Berlin',
  currency: 'EUR',
  demand_unit: 'units',
  depots: depots.map((depot) => ({
    id: depot.id,
    name: depot.name,
    coordinates: depot.coordinate,
    operating_window: windowToApi(depot.window),
    reload_duration_seconds: depot.reloadMinutes * 60,
    supported_vehicle_type_ids: vehicleTypes.map((vehicleType) => vehicleType.id),
  })),
  customers: customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    coordinates: customer.coordinate,
    demand: customer.demand,
    service_duration_seconds: customer.serviceMinutes * 60,
    time_window: windowToApi(customer.timeWindow),
    required: true,
    compatible_depot_ids: [customer.depotId],
    compatible_vehicle_type_ids: vehicleTypes.map((vehicleType) => vehicleType.id),
    address_label: customer.name,
  })),
  vehicle_types: vehicleTypes.map((vehicleType) => ({
    id: vehicleType.id,
    name: vehicleType.name,
    capacity: vehicleType.capacity,
    fixed_activation_cost: vehicleType.fixedCost,
    distance_cost_per_km: vehicleType.distanceCost,
    working_time_cost_per_hour: 20,
    routing_profile: 'driving',
    speed_factor: 1,
    compatible_depot_ids: depots.map((depot) => depot.id),
  })),
  vehicles: vehicles.map((vehicle) => ({
    id: vehicle.id,
    name: vehicle.plate,
    vehicle_type_id: vehicle.typeId,
    home_depot_id: vehicle.depotId,
    shift_window: windowToApi(vehicle.shift),
    enabled: true,
  })),
  objective: {
    distance_weight: 1,
    working_time_weight: 1,
    waiting_weight: 0.01,
  },
  solver: {
    seed: 17,
    time_limit_seconds: 10,
    matrix_provider: 'auto',
    include_geometry: true,
  },
};
