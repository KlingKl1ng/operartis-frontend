export type DataKind = 'depots' | 'customers' | 'vehicleTypes' | 'vehicles';
export type InspectorTab = 'summary' | 'routes' | 'validation';

export interface Depot {
  id: string;
  name: string;
  coordinate: [number, number];
  window: string;
  reloadMinutes: number;
  vehicles: number;
}

export interface Customer {
  id: string;
  name: string;
  coordinate: [number, number];
  demand: number;
  timeWindow: string;
  serviceMinutes: number;
  depotId: string;
  routeId: string;
  sequence: number;
  /** False when the customer is left out of planning. */
  enabled?: boolean;
}

export interface VehicleType {
  id: string;
  name: string;
  capacity: number;
  fixedCost: number;
  distanceCost: number;
  profile: string;
}

export interface Vehicle {
  id: string;
  plate: string;
  typeId: string;
  depotId: string;
  shift: string;
  trips: number;
  utilization: number;
  routeId: string;
}

export interface Trip {
  id: string;
  label: string;
  vehicleId: string;
  depotId: string;
  start: string;
  end: string;
  startMinute: number;
  endMinute: number;
  customerIds: string[];
  visits: TripVisit[];
  distanceKm: number;
  load: number;
  capacity: number;
  color: string;
}

export interface TripVisit {
  customerId: string;
  arrival: string;
  departure: string;
  arrivalMinute: number;
  departureMinute: number;
  waitingMinutes: number;
  delivered: number;
}

export interface Route {
  id: string;
  vehicleId: string;
  label: string;
  color: string;
  distanceKm: number;
  duration: string;
  stops: number;
  trips: number;
  cost: number;
  coordinates: [number, number][];
}

export interface ValidationItem {
  id: string;
  level: 'error' | 'warning' | 'info' | 'success';
  title: string;
  detail: string;
  entity?: string;
}

export interface ApiTimeWindow {
  start: number;
  end: number;
}

export interface ApiDepot {
  id: string;
  name: string;
  coordinates: [number, number];
  operating_window: ApiTimeWindow;
  reload_duration_seconds: number;
  supported_vehicle_type_ids: string[] | null;
}

export interface ApiCustomer {
  id: string;
  name: string;
  coordinates: [number, number];
  demand: number;
  service_duration_seconds: number;
  time_window: ApiTimeWindow;
  required: true;
  compatible_depot_ids: string[] | null;
  compatible_vehicle_type_ids: string[] | null;
  address_label: string | null;
  /** Omitted when true; disabled customers stay in the scenario but are not planned. */
  enabled?: boolean;
}

export interface ApiVehicleType {
  id: string;
  name: string;
  capacity: number;
  fixed_activation_cost: number;
  distance_cost_per_km: number;
  working_time_cost_per_hour: number;
  routing_profile: string;
  speed_factor: number;
  compatible_depot_ids: string[] | null;
}

export interface ApiPhysicalVehicle {
  id: string;
  name: string | null;
  vehicle_type_id: string;
  home_depot_id: string;
  shift_window: ApiTimeWindow;
  enabled: boolean;
}

export interface VrpScenario {
  schema_version: '1.0';
  name: string;
  description: string | null;
  planning_date: string;
  timezone: string;
  currency: string;
  demand_unit: string;
  depots: ApiDepot[];
  customers: ApiCustomer[];
  vehicle_types: ApiVehicleType[];
  vehicles: ApiPhysicalVehicle[];
  objective: {
    distance_weight: number;
    working_time_weight: number;
    waiting_weight: number;
  };
  solver: {
    seed: number;
    time_limit_seconds: number;
    matrix_provider: 'auto' | 'osrm' | 'precomputed' | 'haversine';
    include_geometry: boolean;
  };
  matrix?: unknown;
}

export interface ApiValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  entity_type?: string | null;
  entity_id?: string | null;
  field?: string | null;
  details?: Record<string, unknown> | null;
}

export interface ScenarioTemplate {
  id: string;
  name: string;
  description: string | null;
  location: string;
  filename: string;
  planning_date: string;
  currency: string;
  demand_unit: string;
  vehicle_types: string[];
  counts: { depots: number; customers: number; vehicle_types: number; vehicles: number };
}

export interface SavedPlanInfo {
  id: string;
  job_id: string | null;
  created_at: string;
  summary: {
    total_cost?: number;
    distance_meters?: number;
    vehicles_used?: number;
    trips?: number;
    customers_served?: number;
    customers_total?: number;
    currency?: string;
    solver_version?: string;
  };
}

export interface SavedScenarioVersion {
  id: string;
  version_number: number;
  created_at: string;
  byte_size: number;
  plan_count: number;
  latest_plan: SavedPlanInfo | null;
  summary: {
    scenario_name?: string;
    planning_date?: string;
    currency?: string;
    counts?: { depots: number; customers: number; vehicle_types: number; vehicles: number };
  };
}

export interface SavedScenario {
  id: string;
  name: string;
  source_filename: string | null;
  created_at: string;
  updated_at: string;
  version_count: number;
  latest_version: SavedScenarioVersion | null;
  versions: SavedScenarioVersion[];
}

export interface SavedScenarioList {
  scenarios: SavedScenario[];
  limits: { scenarios: number; library_bytes: number };
}

export interface SaveScenarioResult {
  scenario: SavedScenario;
  version: SavedScenarioVersion;
  created: boolean;
}

export interface OpenedScenarioVersion {
  scenario: SavedScenario;
  version: SavedScenarioVersion;
  report: ValidationResponse;
  plan: (SavedPlanInfo & { solution: VrpSolution }) | null;
}

export interface AttachPlanResult {
  plan: SavedPlanInfo;
  version: SavedScenarioVersion;
  created: boolean;
}

export interface ValidationResponse {
  valid: boolean;
  schema_version: string;
  normalized_scenario: VrpScenario;
  errors: ApiValidationIssue[];
  warnings: ApiValidationIssue[];
  counts: Record<string, number>;
  matrix?: Record<string, unknown> | null;
}

export interface SolveAccepted {
  job_id: string;
  status: string;
  status_url: string;
  result_url: string;
}

export interface VrpJobStatus {
  job_id: string;
  module: string;
  job_type: string;
  status: string;
  progress: number;
  stage: string;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  warnings: ApiValidationIssue[];
}

export interface SolutionStop {
  customer_id: string;
  sequence: number;
  arrival_time: number;
  service_start_time: number;
  departure_time: number;
  waiting_seconds: number;
  delivered_demand: number;
  load_after: number;
  time_window: ApiTimeWindow;
}

export interface SolutionTrip {
  id: string;
  sequence: number;
  depot_id: string;
  vehicle_type_id: string;
  departure_time: number;
  return_time: number;
  latest_departure: number;
  distance_meters: number;
  duration_seconds: number;
  waiting_seconds: number;
  load: number;
  reload_before_seconds: number;
  stops: SolutionStop[];
  geometry: { type: 'LineString'; coordinates: [number, number][] } | null;
  geometry_error?: string;
}

export interface SolutionVehicle {
  vehicle_id: string;
  vehicle_name: string | null;
  vehicle_type_id: string;
  home_depot_id: string;
  shift_window: ApiTimeWindow;
  trips: SolutionTrip[];
}

export interface VrpSolution {
  schema_version: string;
  status: 'feasible' | 'infeasible';
  input_hash: string;
  metadata: {
    solver_version: string;
    seed: number;
    runtime_seconds: number;
    matrix: Record<string, unknown>;
    configuration: Record<string, unknown>;
  };
  summary: {
    customers_total: number;
    customers_served: number;
    customers_unserved: number;
    vehicles_used: number;
    trips: number;
    activation_cost: number;
    distance_cost: number;
    working_time_cost: number;
    total_cost: number;
    distance_meters: number;
    waiting_seconds: number;
  };
  objective: Record<string, number>;
  vehicles: SolutionVehicle[];
  unserved: Array<{ customer_id: string; reason_code: string; details: Record<string, unknown> }>;
  verification: {
    passed: boolean;
    errors: Array<Record<string, unknown>>;
    warnings: Array<Record<string, unknown>>;
  };
}

export interface VrpViewData {
  depots: Depot[];
  customers: Customer[];
  vehicleTypes: VehicleType[];
  vehicles: Vehicle[];
  routes: Route[];
  trips: Trip[];
  validationItems: ValidationItem[];
}
