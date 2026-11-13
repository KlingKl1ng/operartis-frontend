import type { DataKind, VrpScenario } from './types';

export type TableRow = Record<string, string>;
export type ScenarioTableSet = Record<DataKind, TableRow[]>;

type Entity = Record<string, unknown>;
type ColumnWriter = (value: string, entity: Entity) => Entity;

const SCENARIO_LIST: Record<DataKind, 'depots' | 'customers' | 'vehicle_types' | 'vehicles'> = {
  depots: 'depots',
  customers: 'customers',
  vehicleTypes: 'vehicle_types',
  vehicles: 'vehicles',
};

class EditError extends Error {}

function clockSeconds(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match || Number(match[2]) > 59) throw new EditError('use HH:MM');
  return Number(match[1]) * 3600 + Number(match[2]) * 60;
}

function timeWindow(value: string) {
  const parts = value.split(/\s*[–—-]\s*/);
  if (parts.length !== 2) throw new EditError('use HH:MM–HH:MM');
  const start = clockSeconds(parts[0]);
  const end = clockSeconds(parts[1]);
  if (end <= start) throw new EditError('the end must be after the start');
  return { start, end };
}

function number(value: string, { integer = false } = {}): number {
  const cleaned = value.trim().replace(/,/g, '');
  const parsed = Number(cleaned);
  if (!cleaned || !Number.isFinite(parsed)) throw new EditError('enter a number');
  if (parsed < 0) throw new EditError('must not be negative');
  if (integer && !Number.isInteger(parsed)) throw new EditError('enter a whole number');
  return parsed;
}

function minutesAsSeconds(value: string): number {
  return Math.round(number(value.replace(/\s*min(utes)?\.?$/i, '')) * 60);
}

function text(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new EditError('must not be empty');
  return trimmed;
}

/** Table cells hold "lat, lon"; the scenario stores [lon, lat]. */
function coordinates(value: string): [number, number] {
  const parts = value.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part))) throw new EditError('use latitude, longitude');
  const [lat, lon] = parts;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new EditError('latitude must be within ±90 and longitude within ±180');
  return [lon, lat];
}

/**
 * Columns that write back to the scenario. Anything not listed (IDs, routes,
 * fleet counts, trips, utilization, routing profile) is derived or a key, so
 * the table shows it read-only.
 */
export const EDITABLE_COLUMNS: Record<DataKind, Record<string, ColumnWriter>> = {
  depots: {
    Name: (value, depot) => ({ ...depot, name: text(value) }),
    'Operating window': (value, depot) => ({ ...depot, operating_window: timeWindow(value) }),
    Reload: (value, depot) => ({ ...depot, reload_duration_seconds: minutesAsSeconds(value) }),
    Coordinates: (value, depot) => ({ ...depot, coordinates: coordinates(value) }),
  },
  customers: {
    Customer: (value, customer) => ({ ...customer, name: text(value) }),
    Demand: (value, customer) => ({ ...customer, demand: number(value) }),
    'Time window': (value, customer) => ({ ...customer, time_window: timeWindow(value) }),
    Service: (value, customer) => ({ ...customer, service_duration_seconds: minutesAsSeconds(value) }),
  },
  vehicleTypes: {
    Type: (value, vehicleType) => ({ ...vehicleType, name: text(value) }),
    Capacity: (value, vehicleType) => ({ ...vehicleType, capacity: number(value) }),
    'Fixed cost': (value, vehicleType) => ({ ...vehicleType, fixed_activation_cost: number(value) }),
    'Distance cost': (value, vehicleType) => ({ ...vehicleType, distance_cost_per_km: number(value) }),
  },
  vehicles: {
    Plate: (value, vehicle) => ({ ...vehicle, name: text(value) }),
    Type: (value, vehicle) => ({ ...vehicle, vehicle_type_id: text(value) }),
    'Home depot': (value, vehicle) => ({ ...vehicle, home_depot_id: text(value) }),
    Shift: (value, vehicle) => ({ ...vehicle, shift_window: timeWindow(value) }),
  },
};

export function isEditableColumn(kind: DataKind, column: string): boolean {
  return column in EDITABLE_COLUMNS[kind] || (kind === 'customers' && column === 'Allowed Depot');
}

/**
 * Writes the cells that differ from the table as first shown back onto the
 * scenario. Only changed cells are parsed, so rounded display values (e.g.
 * service minutes) never overwrite the exact stored values.
 */
export function applyTableEdits(scenario: VrpScenario, original: ScenarioTableSet, edited: ScenarioTableSet): VrpScenario {
  const next = { ...scenario };
  const errors: string[] = [];
  (Object.keys(EDITABLE_COLUMNS) as DataKind[]).forEach((kind) => {
    const listKey = SCENARIO_LIST[kind];
    const originalById = new Map(original[kind].map((row) => [row.ID, row]));
    const editedById = new Map(edited[kind].map((row) => [row.ID, row]));
    const entities = scenario[listKey] as unknown as Entity[];
    let changed = false;
    const updated = entities.map((entity) => {
      const id = String(entity.id);
      const before = originalById.get(id);
      const after = editedById.get(id);
      if (!before || !after) return entity;
      let result = entity;
      Object.entries(EDITABLE_COLUMNS[kind]).forEach(([column, write]) => {
        if (after[column] === before[column]) return;
        try {
          result = write(after[column] ?? '', result);
          changed = true;
        } catch (error) {
          if (!(error instanceof EditError)) throw error;
          errors.push(`${id} ${column}: ${error.message}`);
        }
      });
      return result;
    });
    if (changed) (next as Record<string, unknown>)[listKey] = updated;
  });
  if (errors.length) throw new Error(errors.join(' · '));
  return next;
}

/** Problems with one edited row, checked when its ✓ is pressed. */
export function rowEditErrors(kind: DataKind, before: TableRow | undefined, after: TableRow): string[] {
  return Object.entries(EDITABLE_COLUMNS[kind]).flatMap(([column, write]) => {
    if (before && after[column] === before[column]) return [];
    try {
      write(after[column] ?? '', {});
      return [];
    } catch (error) {
      if (!(error instanceof EditError)) throw error;
      return [`${column}: ${error.message}`];
    }
  });
}
