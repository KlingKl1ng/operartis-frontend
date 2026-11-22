import type { Customer, Depot, Route, Trip, ValidationItem, Vehicle, VehicleType } from './types';

export const depots: Depot[] = [
  {
    id: 'BER-01',
    name: 'Berlin Central Depot',
    coordinate: [13.405, 52.52],
    window: '06:00–20:00',
    reloadMinutes: 25,
    vehicles: 3,
  },
  {
    id: 'BER-02',
    name: 'Spandau Cross-dock',
    coordinate: [13.199, 52.535],
    window: '06:30–19:00',
    reloadMinutes: 20,
    vehicles: 2,
  },
];

export const customers: Customer[] = [
  { id: 'C-001', name: 'Mitte Market', coordinate: [13.384, 52.527], demand: 18, timeWindow: '07:30–09:30', serviceMinutes: 12, depotId: 'BER-01', routeId: 'R-01', sequence: 1 },
  { id: 'C-002', name: 'Prenzlauer Shop', coordinate: [13.423, 52.542], demand: 12, timeWindow: '08:00–10:30', serviceMinutes: 10, depotId: 'BER-01', routeId: 'R-01', sequence: 2 },
  { id: 'C-003', name: 'Friedrichshain Hub', coordinate: [13.454, 52.515], demand: 21, timeWindow: '08:45–11:00', serviceMinutes: 15, depotId: 'BER-01', routeId: 'R-01', sequence: 3 },
  { id: 'C-004', name: 'Kreuzberg Foods', coordinate: [13.401, 52.492], demand: 16, timeWindow: '09:00–11:30', serviceMinutes: 12, depotId: 'BER-01', routeId: 'R-01', sequence: 4 },
  { id: 'C-005', name: 'Tempelhof Trade', coordinate: [13.382, 52.466], demand: 25, timeWindow: '07:45–10:15', serviceMinutes: 18, depotId: 'BER-01', routeId: 'R-02', sequence: 1 },
  { id: 'C-006', name: 'Neukölln Store', coordinate: [13.441, 52.478], demand: 14, timeWindow: '08:30–12:00', serviceMinutes: 10, depotId: 'BER-01', routeId: 'R-02', sequence: 2 },
  { id: 'C-007', name: 'Treptow Supply', coordinate: [13.489, 52.493], demand: 22, timeWindow: '09:15–12:45', serviceMinutes: 15, depotId: 'BER-01', routeId: 'R-02', sequence: 3 },
  { id: 'C-008', name: 'Lichtenberg Point', coordinate: [13.501, 52.522], demand: 17, timeWindow: '11:00–14:30', serviceMinutes: 12, depotId: 'BER-01', routeId: 'R-02', sequence: 4 },
  { id: 'C-009', name: 'Wedding Market', coordinate: [13.35, 52.555], demand: 19, timeWindow: '08:00–10:45', serviceMinutes: 12, depotId: 'BER-01', routeId: 'R-03', sequence: 1 },
  { id: 'C-010', name: 'Reinickendorf DC', coordinate: [13.315, 52.581], demand: 28, timeWindow: '09:30–12:00', serviceMinutes: 20, depotId: 'BER-01', routeId: 'R-03', sequence: 2 },
  { id: 'C-011', name: 'Moabit Retail', coordinate: [13.332, 52.528], demand: 13, timeWindow: '09:45–12:00', serviceMinutes: 10, depotId: 'BER-01', routeId: 'R-03', sequence: 3 },
  { id: 'C-012', name: 'Charlottenburg Haus', coordinate: [13.303, 52.515], demand: 24, timeWindow: '07:30–10:00', serviceMinutes: 15, depotId: 'BER-02', routeId: 'R-04', sequence: 1 },
  { id: 'C-013', name: 'Wilmersdorf Store', coordinate: [13.287, 52.489], demand: 20, timeWindow: '08:15–11:15', serviceMinutes: 12, depotId: 'BER-02', routeId: 'R-04', sequence: 2 },
  { id: 'C-014', name: 'Zehlendorf Market', coordinate: [13.258, 52.434], demand: 26, timeWindow: '09:00–11:05', serviceMinutes: 18, depotId: 'BER-02', routeId: 'R-04', sequence: 3 },
  { id: 'C-015', name: 'Potsdam North', coordinate: [13.083, 52.421], demand: 31, timeWindow: '10:30–13:30', serviceMinutes: 20, depotId: 'BER-02', routeId: 'R-04', sequence: 4 },
  { id: 'C-016', name: 'Falkensee Outlet', coordinate: [13.092, 52.559], demand: 18, timeWindow: '08:00–11:30', serviceMinutes: 12, depotId: 'BER-02', routeId: 'R-05', sequence: 1 },
  { id: 'C-017', name: 'Hennigsdorf Supply', coordinate: [13.209, 52.638], demand: 23, timeWindow: '09:15–12:30', serviceMinutes: 15, depotId: 'BER-02', routeId: 'R-05', sequence: 2 },
  { id: 'C-018', name: 'Tegel Business Park', coordinate: [13.284, 52.589], demand: 15, timeWindow: '10:00–14:00', serviceMinutes: 12, depotId: 'BER-02', routeId: 'R-05', sequence: 3 },
];

export const vehicleTypes: VehicleType[] = [
  { id: 'VT-L', name: 'Large rigid · 18t', capacity: 108, fixedCost: 74, distanceCost: 1.12, timeCost: 20, profile: 'Truck' },
  { id: 'VT-M', name: 'Medium box · 7.5t', capacity: 80, fixedCost: 52, distanceCost: 0.89, timeCost: 20, profile: 'Truck' },
  { id: 'VT-S', name: 'Urban van · 3.5t', capacity: 64, fixedCost: 31, distanceCost: 0.61, timeCost: 20, profile: 'Van' },
];

export const vehicles: Vehicle[] = [
  { id: 'VEH-01', plate: 'B-OP 2401', typeId: 'VT-L', depotId: 'BER-01', shift: '06:30–18:30', trips: 2, utilization: 86, routeId: 'R-01' },
  { id: 'VEH-02', plate: 'B-OP 2402', typeId: 'VT-M', depotId: 'BER-01', shift: '07:00–17:30', trips: 2, utilization: 79, routeId: 'R-02' },
  { id: 'VEH-03', plate: 'B-OP 2403', typeId: 'VT-S', depotId: 'BER-01', shift: '07:00–16:00', trips: 1, utilization: 71, routeId: 'R-03' },
  { id: 'VEH-04', plate: 'B-OP 2501', typeId: 'VT-L', depotId: 'BER-02', shift: '06:30–18:00', trips: 1, utilization: 88, routeId: 'R-04' },
  { id: 'VEH-05', plate: 'B-OP 2502', typeId: 'VT-S', depotId: 'BER-02', shift: '07:30–16:30', trips: 1, utilization: 64, routeId: 'R-05' },
];

const routeCoordinatesFromTrips = (vehicleId: string): [number, number][] => {
  const coordinates: [number, number][] = [];

  trips
    .filter((trip) => trip.vehicleId === vehicleId)
    .forEach((trip, index) => {
      const depot = depots.find((item) => item.id === trip.depotId)!.coordinate;
      if (index === 0) coordinates.push(depot);
      trip.customerIds.forEach((customerId) => {
        coordinates.push(customers.find((item) => item.id === customerId)!.coordinate);
      });
      coordinates.push(depot);
    });

  return coordinates;
};

export const trips: Trip[] = [
  { id: 'T-01A', label: 'Trip 1', vehicleId: 'VEH-01', depotId: 'BER-01', start: '06:50', end: '10:02', startMinute: 50, endMinute: 242, customerIds: ['C-001', 'C-002'], visits: [{ customerId: 'C-001', arrival: '07:30', departure: '07:42', arrivalMinute: 90, departureMinute: 102, waitingMinutes: 0, delivered: 0 }, { customerId: 'C-002', arrival: '08:18', departure: '08:28', arrivalMinute: 138, departureMinute: 148, waitingMinutes: 0, delivered: 0 }], distanceKm: 14.1, load: 30, capacity: 108, color: '#f59e0b' },
  { id: 'T-01B', label: 'Trip 2', vehicleId: 'VEH-01', depotId: 'BER-01', start: '10:27', end: '13:38', startMinute: 267, endMinute: 458, customerIds: ['C-003', 'C-004'], visits: [{ customerId: 'C-003', arrival: '10:42', departure: '10:57', arrivalMinute: 282, departureMinute: 297, waitingMinutes: 0, delivered: 0 }, { customerId: 'C-004', arrival: '11:16', departure: '11:28', arrivalMinute: 316, departureMinute: 328, waitingMinutes: 0, delivered: 0 }], distanceKm: 17.7, load: 37, capacity: 108, color: '#f59e0b' },
  { id: 'T-02A', label: 'Trip 1', vehicleId: 'VEH-02', depotId: 'BER-01', start: '07:10', end: '10:31', startMinute: 70, endMinute: 271, customerIds: ['C-005', 'C-006'], visits: [{ customerId: 'C-005', arrival: '07:45', departure: '08:03', arrivalMinute: 105, departureMinute: 123, waitingMinutes: 0, delivered: 0 }, { customerId: 'C-006', arrival: '08:30', departure: '08:40', arrivalMinute: 150, departureMinute: 160, waitingMinutes: 0, delivered: 0 }], distanceKm: 19.3, load: 39, capacity: 80, color: '#0891b2' },
  { id: 'T-02B', label: 'Trip 2', vehicleId: 'VEH-02', depotId: 'BER-01', start: '10:56', end: '14:09', startMinute: 296, endMinute: 489, customerIds: ['C-007', 'C-008'], visits: [{ customerId: 'C-007', arrival: '11:20', departure: '11:35', arrivalMinute: 320, departureMinute: 335, waitingMinutes: 0, delivered: 0 }, { customerId: 'C-008', arrival: '12:05', departure: '12:17', arrivalMinute: 365, departureMinute: 377, waitingMinutes: 0, delivered: 0 }], distanceKm: 19.3, load: 39, capacity: 80, color: '#0891b2' },
  { id: 'T-03A', label: 'Trip 1', vehicleId: 'VEH-03', depotId: 'BER-01', start: '07:30', end: '10:21', startMinute: 90, endMinute: 261, customerIds: ['C-009', 'C-010', 'C-011'], visits: [{ customerId: 'C-009', arrival: '08:00', departure: '08:12', arrivalMinute: 120, departureMinute: 132, waitingMinutes: 0, delivered: 0 }, { customerId: 'C-010', arrival: '09:30', departure: '09:50', arrivalMinute: 210, departureMinute: 230, waitingMinutes: 0, delivered: 0 }, { customerId: 'C-011', arrival: '10:02', departure: '10:12', arrivalMinute: 242, departureMinute: 252, waitingMinutes: 0, delivered: 0 }], distanceKm: 27.4, load: 60, capacity: 64, color: '#7c3aed' },
  { id: 'T-04A', label: 'Trip 1', vehicleId: 'VEH-04', depotId: 'BER-02', start: '06:55', end: '11:21', startMinute: 55, endMinute: 321, customerIds: ['C-012', 'C-013', 'C-014', 'C-015'], visits: [{ customerId: 'C-012', arrival: '07:30', departure: '07:45', arrivalMinute: 90, departureMinute: 105, waitingMinutes: 0, delivered: 0 }, { customerId: 'C-013', arrival: '08:15', departure: '08:27', arrivalMinute: 135, departureMinute: 147, waitingMinutes: 0, delivered: 0 }, { customerId: 'C-014', arrival: '09:20', departure: '09:38', arrivalMinute: 200, departureMinute: 218, waitingMinutes: 0, delivered: 0 }, { customerId: 'C-015', arrival: '10:30', departure: '10:50', arrivalMinute: 270, departureMinute: 290, waitingMinutes: 0, delivered: 0 }], distanceKm: 58.2, load: 101, capacity: 108, color: '#e11d48' },
  { id: 'T-05A', label: 'Trip 1', vehicleId: 'VEH-05', depotId: 'BER-02', start: '08:00', end: '10:38', startMinute: 120, endMinute: 278, customerIds: ['C-016', 'C-017', 'C-018'], visits: [{ customerId: 'C-016', arrival: '08:18', departure: '08:30', arrivalMinute: 138, departureMinute: 150, waitingMinutes: 0, delivered: 0 }, { customerId: 'C-017', arrival: '09:15', departure: '09:30', arrivalMinute: 195, departureMinute: 210, waitingMinutes: 0, delivered: 0 }, { customerId: 'C-018', arrival: '10:05', departure: '10:17', arrivalMinute: 245, departureMinute: 257, waitingMinutes: 0, delivered: 0 }], distanceKm: 30.4, load: 56, capacity: 64, color: '#059669' },
];

export const routes: Route[] = [
  { id: 'R-01', vehicleId: 'VEH-01', label: 'Central amber', color: '#f59e0b', distanceKm: 31.8, duration: '3h 18m', stops: 4, trips: 2, cost: 116, coordinates: routeCoordinatesFromTrips('VEH-01') },
  { id: 'R-02', vehicleId: 'VEH-02', label: 'East cyan', color: '#0891b2', distanceKm: 38.6, duration: '3h 42m', stops: 4, trips: 2, cost: 104, coordinates: routeCoordinatesFromTrips('VEH-02') },
  { id: 'R-03', vehicleId: 'VEH-03', label: 'North violet', color: '#7c3aed', distanceKm: 27.4, duration: '2h 51m', stops: 3, trips: 1, cost: 63, coordinates: routeCoordinatesFromTrips('VEH-03') },
  { id: 'R-04', vehicleId: 'VEH-04', label: 'Southwest rose', color: '#e11d48', distanceKm: 58.2, duration: '4h 26m', stops: 4, trips: 1, cost: 138, coordinates: routeCoordinatesFromTrips('VEH-04') },
  { id: 'R-05', vehicleId: 'VEH-05', label: 'Northwest emerald', color: '#059669', distanceKm: 30.4, duration: '2h 38m', stops: 3, trips: 1, cost: 61, coordinates: routeCoordinatesFromTrips('VEH-05') },
];

export const validationItems: ValidationItem[] = [
  { id: 'V-01', level: 'success', title: 'All hard constraints satisfied', detail: '18 of 18 required customers are scheduled exactly once.' },
  { id: 'V-02', level: 'warning', title: 'Narrow service slack', detail: 'Arrival has 18 minutes of remaining slack before the hard window closes.', entity: 'C-014' },
  { id: 'V-03', level: 'warning', title: 'High trip utilization', detail: 'Trip reaches 94% of its compatible vehicle capacity.', entity: 'T-04A' },
  { id: 'V-04', level: 'info', title: 'Reload scheduled', detail: 'A 25-minute reload separates Trip 1 and Trip 2.', entity: 'VEH-01' },
];
