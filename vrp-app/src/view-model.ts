import type {
  ApiValidationIssue,
  Customer,
  Depot,
  Route,
  Trip,
  ValidationItem,
  ValidationResponse,
  Vehicle,
  VehicleType,
  VrpScenario,
  VrpSolution,
  VrpViewData,
} from './types';

// Amber/gold is reserved for depots, grouped stops, and brand accents, so routes never reuse it.
const ROUTE_COLORS = ['#0891b2', '#7c3aed', '#e11d48', '#059669', '#2563eb', '#db2777', '#65a30d'];

export function formatClock(seconds: number): string {
  const normalized = Math.max(0, Math.round(seconds));
  const hours = Math.floor(normalized / 3600);
  const minutes = Math.floor((normalized % 3600) / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatWindow(window: { start: number; end: number }): string {
  return `${formatClock(window.start)}–${formatClock(window.end)}`;
}

function formatDuration(seconds: number): string {
  const totalMinutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function issueToItem(issue: ApiValidationIssue, index: number): ValidationItem {
  return {
    id: `${issue.code}-${issue.entity_id || index}`,
    level: issue.severity,
    title: issue.code.replaceAll('_', ' ').replace(/^./, (value) => value.toUpperCase()),
    detail: issue.message,
    entity: issue.entity_id || undefined,
  };
}

function solutionValidationItems(solution: VrpSolution | null): ValidationItem[] {
  if (!solution) return [];
  const items: ValidationItem[] = [];
  if (solution.verification.passed) {
    items.push({
      id: 'solution-verified',
      level: 'success',
      title: 'Independent verification passed',
      detail: `${solution.summary.customers_served} of ${solution.summary.customers_total} required customers were checked against the solved schedule.`,
    });
  }
  solution.verification.errors.forEach((error, index) => items.push({
    id: `verification-error-${index}`,
    level: 'error',
    title: String(error.code || 'Verification error').replaceAll('_', ' '),
    detail: String(error.message || 'The independent verifier rejected part of the solution.'),
  }));
  solution.verification.warnings.forEach((warning, index) => items.push({
    id: `verification-warning-${index}`,
    level: 'warning',
    title: String(warning.code || 'Verification warning').replaceAll('_', ' '),
    detail: String(warning.message || 'The solution has a verification warning.'),
  }));
  solution.unserved.forEach((item) => items.push({
    id: `unserved-${item.customer_id}`,
    level: 'warning',
    title: 'Customer not scheduled',
    detail: item.reason_code.replaceAll('_', ' '),
    entity: item.customer_id,
  }));
  return items;
}

export function buildViewData(
  scenario: VrpScenario,
  solution: VrpSolution | null,
  validation: ValidationResponse | null,
): VrpViewData {
  const routeIdByVehicle = new Map<string, string>();
  solution?.vehicles.forEach((vehicle, index) => routeIdByVehicle.set(vehicle.vehicle_id, `R-${String(index + 1).padStart(2, '0')}`));

  const assignmentByCustomer = new Map<string, { routeId: string; depotId: string; sequence: number }>();
  solution?.vehicles.forEach((vehicle) => {
    const routeId = routeIdByVehicle.get(vehicle.vehicle_id)!;
    let routeSequence = 0;
    vehicle.trips.forEach((trip) => trip.stops.forEach((stop) => {
      routeSequence += 1;
      assignmentByCustomer.set(stop.customer_id, { routeId, depotId: trip.depot_id, sequence: routeSequence });
    }));
  });

  const depots: Depot[] = scenario.depots.map((depot) => ({
    id: depot.id,
    name: depot.name,
    coordinate: depot.coordinates,
    window: formatWindow(depot.operating_window),
    reloadMinutes: Math.round(depot.reload_duration_seconds / 60),
    vehicles: scenario.vehicles.filter((vehicle) => vehicle.home_depot_id === depot.id && vehicle.enabled).length,
  }));

  const customers: Customer[] = scenario.customers.map((customer) => {
    const assignment = assignmentByCustomer.get(customer.id);
    return {
      id: customer.id,
      name: customer.name,
      coordinate: customer.coordinates,
      demand: customer.demand,
      timeWindow: formatWindow(customer.time_window),
      serviceMinutes: Math.round(customer.service_duration_seconds / 60),
      depotId: assignment?.depotId || customer.compatible_depot_ids?.[0] || 'Unassigned',
      routeId: assignment?.routeId || '',
      sequence: assignment?.sequence || 0,
      enabled: customer.enabled !== false,
    };
  });

  const vehicleTypes: VehicleType[] = scenario.vehicle_types.map((vehicleType) => ({
    id: vehicleType.id,
    name: vehicleType.name,
    capacity: vehicleType.capacity,
    fixedCost: vehicleType.fixed_activation_cost,
    distanceCost: vehicleType.distance_cost_per_km,
    timeCost: vehicleType.working_time_cost_per_hour,
    profile: vehicleType.routing_profile,
  }));

  const trips: Trip[] = [];
  const routes: Route[] = [];
  const vehicles: Vehicle[] = [];
  solution?.vehicles.forEach((solutionVehicle, index) => {
    const routeId = routeIdByVehicle.get(solutionVehicle.vehicle_id)!;
    const color = ROUTE_COLORS[index % ROUTE_COLORS.length];
    const physicalVehicle = scenario.vehicles.find((vehicle) => vehicle.id === solutionVehicle.vehicle_id);
    const vehicleType = scenario.vehicle_types.find((item) => item.id === solutionVehicle.vehicle_type_id);
    const routeTrips = solutionVehicle.trips;
    const tripLoadRatio = Math.max(0, ...routeTrips.map((trip) => vehicleType ? trip.load / vehicleType.capacity : 0));
    const coordinates: [number, number][] = [];
    routeTrips.forEach((solutionTrip) => {
      const depot = scenario.depots.find((item) => item.id === solutionTrip.depot_id);
      const fallbackCoordinates = depot
        ? [depot.coordinates, ...solutionTrip.stops.map((stop) => scenario.customers.find((item) => item.id === stop.customer_id)?.coordinates).filter(Boolean) as [number, number][], depot.coordinates]
        : [];
      const tripCoordinates = solutionTrip.geometry?.coordinates?.length ? solutionTrip.geometry.coordinates : fallbackCoordinates;
      tripCoordinates.forEach((coordinate, coordinateIndex) => {
        const previous = coordinates[coordinates.length - 1];
        if (coordinateIndex > 0 || !previous || previous[0] !== coordinate[0] || previous[1] !== coordinate[1]) coordinates.push(coordinate);
      });
      trips.push({
        id: solutionTrip.id,
        label: `Trip ${solutionTrip.sequence}`,
        vehicleId: solutionVehicle.vehicle_id,
        depotId: solutionTrip.depot_id,
        start: formatClock(solutionTrip.departure_time),
        end: formatClock(solutionTrip.return_time),
        startMinute: Math.round(solutionTrip.departure_time / 60),
        endMinute: Math.round(solutionTrip.return_time / 60),
        customerIds: solutionTrip.stops.map((stop) => stop.customer_id),
        visits: solutionTrip.stops.map((stop) => ({
          customerId: stop.customer_id,
          arrival: formatClock(stop.arrival_time),
          departure: formatClock(stop.departure_time),
          arrivalMinute: Math.round(stop.arrival_time / 60),
          departureMinute: Math.round(stop.departure_time / 60),
          waitingMinutes: Math.round(stop.waiting_seconds / 60),
          delivered: stop.delivered_demand,
        })),
        distanceKm: Math.round(solutionTrip.distance_meters) / 1000,
        load: solutionTrip.load,
        capacity: vehicleType?.capacity || solutionTrip.load,
        color,
      });
    });

    const firstDeparture = routeTrips[0]?.departure_time || 0;
    const lastReturn = routeTrips[routeTrips.length - 1]?.return_time || firstDeparture;
    const distanceMeters = routeTrips.reduce((total, trip) => total + trip.distance_meters, 0);
    const routeCost = vehicleType
      ? vehicleType.fixed_activation_cost
        + distanceMeters / 1000 * vehicleType.distance_cost_per_km
        + (lastReturn - firstDeparture) / 3600 * vehicleType.working_time_cost_per_hour
      : 0;
    routes.push({
      id: routeId,
      vehicleId: solutionVehicle.vehicle_id,
      label: `${solutionVehicle.home_depot_id} · ${vehicleType?.name || solutionVehicle.vehicle_type_id}`,
      color,
      distanceKm: Math.round(distanceMeters / 100) / 10,
      duration: formatDuration(lastReturn - firstDeparture),
      stops: routeTrips.reduce((total, trip) => total + trip.stops.length, 0),
      trips: routeTrips.length,
      cost: Math.round(routeCost),
      coordinates,
    });
    vehicles.push({
      id: solutionVehicle.vehicle_id,
      plate: solutionVehicle.vehicle_name || physicalVehicle?.name || solutionVehicle.vehicle_id,
      typeId: solutionVehicle.vehicle_type_id,
      depotId: solutionVehicle.home_depot_id,
      shift: formatWindow(solutionVehicle.shift_window),
      trips: routeTrips.length,
      utilization: Math.round(tripLoadRatio * 100),
      routeId,
    });
  });

  const validationItems = [
    ...(validation?.errors || []).map(issueToItem),
    ...(validation?.warnings || []).map(issueToItem),
    ...solutionValidationItems(solution),
  ];
  if (!validationItems.length) {
    validationItems.push({
      id: 'scenario-not-validated',
      level: 'info',
      title: 'Scenario ready for validation',
      detail: 'Import or optimize to run the backend schema and constraint checks.',
    });
  }

  const solvedVehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  // Input fields always come from the scenario; only plan figures come from the solution.
  const allVehicles = scenario.vehicles.map((vehicle) => {
    const solved = solvedVehicleById.get(vehicle.id);
    return {
      id: vehicle.id,
      plate: vehicle.name || vehicle.id,
      typeId: vehicle.vehicle_type_id,
      depotId: vehicle.home_depot_id,
      shift: formatWindow(vehicle.shift_window),
      trips: solved?.trips || 0,
      utilization: solved?.utilization || 0,
      routeId: solved?.routeId || '',
    };
  });

  return { depots, customers, vehicleTypes, vehicles: allVehicles, routes, trips, validationItems };
}
