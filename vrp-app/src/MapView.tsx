import { useEffect, useRef } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type MapLayerMouseEvent, type Popup, type StyleSpecification } from 'maplibre-gl';
import type { Customer, Depot, Route } from './types';

interface MapViewProps {
  customers: Customer[];
  depots: Depot[];
  routes: Route[];
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string | null) => void;
  onSelectCustomer: (customerId: string) => void;
  dark: boolean;
  fitRequest: number;
}

type PointFeature = {
  type: 'Feature';
  properties: Record<string, string | number>;
  geometry: { type: 'Point'; coordinates: [number, number] };
};

const isLocal = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
const tileUrl = import.meta.env.VITE_VRP_TILE_URL || (isLocal ? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' : '/map-tiles/{z}/{x}/{y}.png');
// Dark mode uses a native dark vector style (OpenFreeMap: free, no key) instead of dimming the light raster tiles.
const darkStyleUrl = import.meta.env.VITE_VRP_DARK_STYLE_URL || 'https://tiles.openfreemap.org/styles/dark';

const lightStyle: StyleSpecification = {
  version: 8,
  sources: {
    osm: { type: 'raster', tiles: [tileUrl], tileSize: 256, attribution: '© OpenStreetMap contributors' },
  },
  layers: [
    { id: 'basemap-bg', type: 'background', paint: { 'background-color': '#dbe4ea' } },
    { id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-saturation': -0.45, 'raster-contrast': 0.04 } },
  ],
};

const basemapStyle = (dark: boolean) => (dark ? darkStyleUrl : lightStyle);

// OpenFreeMap's dark style is neutral black; shift its base colours to the app's navy
// (--sidebar #0c1422, --surface #101827) so the map sits in the panels. Roads keep their contrast.
const NAVY_BASE = '#0c1422';
const DARK_BASEMAP_TINT: [layer: string, property: string, value: string][] = [
  ['background', 'background-color', NAVY_BASE],
  ['water', 'fill-color', '#13213a'],
  ['waterway', 'line-color', '#13213a'],
  ['landuse_residential', 'fill-color', '#0f1829'],
  ['landcover_wood', 'fill-color', '#121c2c'],
  ['landuse_park', 'fill-color', '#121c2c'],
  ['landcover_ice_shelf', 'fill-color', NAVY_BASE],
  ['landcover_glacier', 'fill-color', '#0a111d'],
  ['building', 'fill-color', '#0a111d'],
  ['building', 'fill-outline-color', '#16223a'],
  ['aeroway-area', 'fill-color', '#0a111d'],
  ['aeroway-runway', 'line-color', '#0a111d'],
  ['aeroway-taxiway', 'line-color', '#1a2538'],
  ['road_area_pier', 'fill-color', NAVY_BASE],
  ['road_pier', 'line-color', NAVY_BASE],
  ['highway_path', 'line-color', '#16223a'],
  ['highway_minor', 'line-color', '#1a2538'],
  ['highway_major_inner', 'line-color', '#111b2b'],
  ['highway_major_subtle', 'line-color', '#273349'],
  ['highway_motorway_subtle', 'line-color', '#1a2538'],
  ['railway', 'line-color', '#1f2a3d'],
  ['railway_minor', 'line-color', '#1f2a3d'],
  ['railway_transit', 'line-color', '#1f2a3d'],
  ['railway_dashline', 'line-color', NAVY_BASE],
  ['railway_minor_dashline', 'line-color', NAVY_BASE],
  ['railway_transit_dashline', 'line-color', NAVY_BASE],
  ['water_name', 'text-halo-color', NAVY_BASE],
  ['highway_name_other', 'text-halo-color', NAVY_BASE],
];

function tintDarkBasemap(map: MapLibreMap) {
  DARK_BASEMAP_TINT.forEach(([layer, property, value]) => {
    if (map.getLayer(layer)) map.setPaintProperty(layer, property, value);
  });
  map.getStyle().layers
    .filter((layer) => layer.id.startsWith('place_'))
    .forEach((layer) => map.setPaintProperty(layer.id, 'text-halo-color', 'rgba(12, 20, 34, 0.75)'));
}

const routeFeature = (routes: Route[], routeId: string) => {
  const route = routes.find((item) => item.id === routeId)!;
  return {
    type: 'Feature' as const,
    properties: { id: route.id },
    geometry: { type: 'LineString' as const, coordinates: route.coordinates },
  };
};

const featureCollection = (features: PointFeature[]) => ({ type: 'FeatureCollection' as const, features });

const customerFeatures = (customers: Customer[], routes: Route[], routeId: string | null = null) => featureCollection(
  customers
    .filter((customer) => !routeId || customer.routeId === routeId)
    .map((customer, index) => {
      const route = routes.find((item) => item.id === customer.routeId);
      const icon = route ? `customer-route-${route.id}-${customer.sequence}` : 'customer-unassigned';
      return {
        type: 'Feature' as const,
        properties: {
          id: customer.id,
          name: customer.name,
          routeId: route?.id || '',
          routeLabel: route?.label || 'Unassigned',
          sequence: customer.sequence,
          timeWindow: customer.timeWindow,
          demand: customer.demand,
          iconAll: icon,
          iconRoute: icon,
          sourceIndex: index,
        },
        geometry: { type: 'Point' as const, coordinates: customer.coordinate },
      };
    }),
);

const depotFeatures = (depots: Depot[]) => featureCollection(depots.map((depot) => ({
  type: 'Feature' as const,
  properties: { id: depot.id, name: depot.name, window: depot.window, icon: 'depot-marker' },
  geometry: { type: 'Point' as const, coordinates: depot.coordinate },
})));

const ROUTE_LINE_WIDTH = 3;
const ROUTE_LINE_WIDTH_SELECTED = 4.5;
const ROUTE_SHADOW_WIDTH = 5.5;
const CUSTOMER_MARKER_SIZE = 0.85;
const CUSTOMER_MARKER_SIZE_SELECTED = 0.92;
const DEPOT_MARKER_SIZE = 0.92;
const CLUSTER_MARKER_SIZE = 0.85;

const markerPalettes = {
  dark: { depotFill: '#0f172a', depotStroke: '#fbbf24', depotLabel: '#fbbf24', clusterFill: '#0f172a', clusterStroke: '#fbbf24', clusterCoin: '#fbbf24', clusterCoinCore: '#0f172a', clusterText: '#ffffff' },
  light: { depotFill: '#ffffff', depotStroke: '#f59e0b', depotLabel: '#b45309', clusterFill: '#ffffff', clusterStroke: '#f59e0b', clusterCoin: '#f59e0b', clusterCoinCore: '#ffffff', clusterText: '#0f172a' },
};

const markerPalette = (dark: boolean) => (dark ? markerPalettes.dark : markerPalettes.light);

function markerImage(label: string, color: string, shape: 'circle' | 'square' = 'circle', dark = false): ImageData {
  const palette = markerPalette(dark);
  const size = 72;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  context.clearRect(0, 0, size, size);
  context.shadowColor = dark ? 'rgba(15, 23, 42, 0.32)' : 'rgba(15, 23, 42, 0.22)';
  context.shadowBlur = 8;
  context.shadowOffsetY = 4;
  context.beginPath();
  if (shape === 'square') context.roundRect(10, 10, 52, 52, 13);
  else context.arc(36, 36, 25, 0, Math.PI * 2);
  context.fillStyle = shape === 'square' ? palette.depotFill : '#ffffff';
  context.fill();
  context.shadowColor = 'transparent';
  context.lineWidth = 7;
  context.strokeStyle = color;
  context.stroke();
  context.fillStyle = shape === 'square' ? palette.depotLabel : '#0f172a';
  context.font = `${label.length > 2 ? 700 : 800} ${label.length > 2 ? 19 : 24}px Inter, Arial, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, 36, 37);
  return context.getImageData(0, 0, size, size);
}

function clusterImage(count: number, dark = false): ImageData {
  const palette = markerPalette(dark);
  const width = 152;
  const height = 64;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  context.clearRect(0, 0, width, height);
  context.shadowColor = dark ? 'rgba(15, 23, 42, 0.34)' : 'rgba(15, 23, 42, 0.22)';
  context.shadowBlur = 8;
  context.shadowOffsetY = 4;
  context.beginPath();
  context.roundRect(5, 5, width - 10, height - 14, 25);
  context.fillStyle = palette.clusterFill;
  context.fill();
  context.shadowColor = 'transparent';
  context.lineWidth = 4;
  context.strokeStyle = palette.clusterStroke;
  context.stroke();

  // Center the icon + label group inside the pill (pill spans x 5..width-5, y 5..height-9).
  const label = `${count} STOPS`;
  context.font = '800 18px Inter, Arial, sans-serif';
  const labelWidth = context.measureText(label).width;
  const iconWidth = 32;
  const gap = 6;
  const groupLeft = (width - (iconWidth + gap + labelWidth)) / 2;
  const centerY = 5 + (height - 14) / 2;

  context.fillStyle = palette.clusterCoin;
  context.beginPath();
  context.arc(groupLeft + 10, centerY, 10, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(groupLeft + 22, centerY, 10, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = palette.clusterCoinCore;
  context.beginPath();
  context.arc(groupLeft + 16, centerY, 7, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = palette.clusterText;
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText(label, groupLeft + iconWidth + gap, centerY + 1);
  return context.getImageData(0, 0, width, height);
}

function registerPointImages(map: MapLibreMap, customers: Customer[], routes: Route[], dark: boolean) {
  if (!map.hasImage('customer-unassigned')) map.addImage('customer-unassigned', markerImage('•', '#64748b'), { pixelRatio: 2 });
  customers.forEach((customer) => {
    const route = routes.find((item) => item.id === customer.routeId);
    if (!route) return;
    const icon = `customer-route-${route.id}-${customer.sequence}`;
    if (!map.hasImage(icon)) map.addImage(icon, markerImage(String(customer.sequence), route.color), { pixelRatio: 2 });
  });
  const setImage = (id: string, image: ImageData) => {
    if (map.hasImage(id)) map.updateImage(id, image);
    else map.addImage(id, image, { pixelRatio: 2 });
  };
  for (let count = 2; count <= customers.length; count += 1) setImage(`cluster-${count}`, clusterImage(count, dark));
  setImage('depot-marker', depotImage(dark));
}

const depotImage = (dark: boolean) => markerImage('D', markerPalette(dark).depotStroke, 'square', dark);

// Screen-space half sizes (CSS px) of the rendered markers, plus a little breathing room.
const CUSTOMER_HALF = 13;
const DEPOT_HALF = 14;
const BADGE_HALF_WIDTH = 31;
const BADGE_HALF_HEIGHT = 12;
const BADGE_GAP = 2;
// Candidate badge centers relative to the cluster point, tried in order until one is free.
const BADGE_CANDIDATES: [number, number][] = [
  [0, -16], [0, 16], [38, 0], [-38, 0],
  [36, -16], [-36, -16], [36, 16], [-36, 16],
  [0, -34], [0, 34], [70, 0], [-70, 0],
];

interface ScreenBox { left: number; right: number; top: number; bottom: number }

const boxAround = (x: number, y: number, halfWidth: number, halfHeight: number): ScreenBox => ({
  left: x - halfWidth, right: x + halfWidth, top: y - halfHeight, bottom: y + halfHeight,
});

const boxesOverlap = (a: ScreenBox, b: ScreenBox) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

// Places each "N STOPS" badge next to its cluster where it does not cover a depot,
// a visible customer marker, or another badge.
function placeClusterBadges(map: MapLibreMap, depots: Depot[]) {
  const badgeSource = map.getSource('cluster-badges') as GeoJSONSource | undefined;
  if (!badgeSource || !map.isSourceLoaded('customers-all')) return;

  const clusters = new Map<number, { coordinates: [number, number]; count: number }>();
  const points = new Map<string, [number, number]>();
  map.querySourceFeatures('customers-all').forEach((feature) => {
    if (feature.geometry.type !== 'Point') return;
    const coordinates = feature.geometry.coordinates as [number, number];
    if (feature.properties?.cluster) {
      clusters.set(Number(feature.properties.cluster_id), { coordinates, count: Number(feature.properties.point_count) });
    } else {
      points.set(String(feature.properties?.id), coordinates);
    }
  });

  const obstacles: ScreenBox[] = [];
  depots.forEach((depot) => {
    const point = map.project(depot.coordinate);
    obstacles.push(boxAround(point.x, point.y, DEPOT_HALF, DEPOT_HALF));
  });
  points.forEach((coordinates) => {
    const point = map.project(coordinates);
    obstacles.push(boxAround(point.x, point.y, CUSTOMER_HALF, CUSTOMER_HALF));
  });

  const badges = [...clusters.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([clusterId, cluster]) => {
      const point = map.project(cluster.coordinates);
      const boxFor = ([dx, dy]: [number, number]) => boxAround(point.x + dx, point.y + dy, BADGE_HALF_WIDTH + BADGE_GAP, BADGE_HALF_HEIGHT + BADGE_GAP);
      const offset = BADGE_CANDIDATES.find((candidate) => !obstacles.some((obstacle) => boxesOverlap(boxFor(candidate), obstacle))) || BADGE_CANDIDATES[0];
      obstacles.push(boxFor(offset));
      return {
        type: 'Feature' as const,
        properties: {
          cluster_id: clusterId,
          point_count: cluster.count,
          // icon-offset is expressed in icon pixels and scaled by icon-size.
          offset: [offset[0] / CLUSTER_MARKER_SIZE, offset[1] / CLUSTER_MARKER_SIZE],
        },
        geometry: { type: 'Point' as const, coordinates: cluster.coordinates },
      };
    });

  badgeSource.setData({ type: 'FeatureCollection', features: badges });
}

function scenarioBounds(depots: Depot[], customers: Customer[]) {
  const bounds = new maplibregl.LngLatBounds();
  depots.forEach((item) => bounds.extend(item.coordinate));
  customers.forEach((item) => bounds.extend(item.coordinate));
  return bounds;
}

function fitMap(map: MapLibreMap, depots: Depot[], customers: Customer[], routes: Route[], routeId: string | null, animated: boolean) {
  const bounds = new maplibregl.LngLatBounds();
  if (routeId) {
    routes.find((item) => item.id === routeId)?.coordinates.forEach((coordinate) => bounds.extend(coordinate));
  } else {
    const allBounds = scenarioBounds(depots, customers);
    if (allBounds.isEmpty()) return;
    bounds.extend(allBounds.getSouthWest());
    bounds.extend(allBounds.getNorthEast());
  }
  const compact = map.getContainer().clientWidth < 640;
  if (bounds.isEmpty()) return;
  map.fitBounds(bounds, {
    padding: compact ? { top: 78, right: 42, bottom: 92, left: 42 } : { top: 78, right: 58, bottom: 82, left: 58 },
    duration: animated ? 600 : 0,
    maxZoom: routeId ? 12.4 : 10.8,
  });
}

const escapeHtml = (value: string | number) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

// Shows one route's stops (or all stops) and dims the other routes.
function applyRouteSelection(map: MapLibreMap, customers: Customer[], routes: Route[], routeId: string | null) {
  const hasSelection = Boolean(routeId);
  (map.getSource('customers-selected') as GeoJSONSource).setData(customerFeatures(customers, routes, routeId || '__none__'));
  map.setLayoutProperty('customer-clusters', 'visibility', hasSelection ? 'none' : 'visible');
  map.setLayoutProperty('customer-points', 'visibility', hasSelection ? 'none' : 'visible');
  map.setLayoutProperty('customer-points-selected', 'visibility', hasSelection ? 'visible' : 'none');
  routes.forEach((route) => {
    const selected = !routeId || routeId === route.id;
    map.setPaintProperty(`route-line-${route.id}`, 'line-opacity', selected ? 0.92 : 0.11);
    map.setPaintProperty(`route-line-${route.id}`, 'line-width', routeId === route.id ? ROUTE_LINE_WIDTH_SELECTED : ROUTE_LINE_WIDTH);
    map.setPaintProperty(`route-shadow-${route.id}`, 'line-opacity', selected ? 0.14 : 0.03);
  });
}

function showPointPopup(map: MapLibreMap, popup: Popup, event: MapLayerMouseEvent, kind: 'customer' | 'depot') {
  const feature = event.features?.[0];
  if (!feature || feature.geometry.type !== 'Point') return;
  const properties = feature.properties as Record<string, string | number>;
  const details = kind === 'customer'
    ? `${escapeHtml(properties.timeWindow)} · ${escapeHtml(properties.demand)} units · ${escapeHtml(properties.routeLabel)}`
    : `${escapeHtml(properties.id)} · ${escapeHtml(properties.window)}`;
  const title = kind === 'customer'
    ? `${escapeHtml(properties.id)} · ${escapeHtml(properties.name)}`
    : escapeHtml(properties.name);
  popup
    .setLngLat(feature.geometry.coordinates as [number, number])
    .setHTML(`<strong>${title}</strong><small>${details}</small>`)
    .addTo(map);
}

export default function MapView({ customers, depots, routes, selectedRouteId, onSelectRoute, onSelectCustomer, dark, fitRequest }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const selectedRouteRef = useRef(selectedRouteId);
  const darkRef = useRef(dark);
  // The theme the current basemap style was loaded for.
  const styleDarkRef = useRef(dark);
  selectedRouteRef.current = selectedRouteId;
  darkRef.current = dark;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let badgeFrame = 0;
    const map = new maplibregl.Map({
      container: containerRef.current,
      center: [13.31, 52.52],
      zoom: 9.55,
      minZoom: 7,
      maxZoom: 16,
      attributionControl: false,
      style: basemapStyle(darkRef.current),
    });
    styleDarkRef.current = darkRef.current;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    const popup = new maplibregl.Popup({ offset: 20, closeButton: false, closeOnClick: false });

    // Route, stop and depot layers sit on top of the basemap. Switching the basemap
    // (light/dark) replaces the whole style, so they are added again on every style load.
    const addOverlay = () => {
      if (styleDarkRef.current) tintDarkBasemap(map);
      registerPointImages(map, customers, routes, darkRef.current);
      routes.forEach((route) => {
        map.addSource(`route-${route.id}`, { type: 'geojson', data: routeFeature(routes, route.id) });
        map.addLayer({
          id: `route-shadow-${route.id}`, type: 'line', source: `route-${route.id}`,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#0f172a', 'line-width': ROUTE_SHADOW_WIDTH, 'line-opacity': 0.12 },
        });
        map.addLayer({
          id: `route-line-${route.id}`, type: 'line', source: `route-${route.id}`,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': route.color, 'line-width': ROUTE_LINE_WIDTH, 'line-opacity': 0.88 },
        });
      });

      map.addSource('customers-all', {
        type: 'geojson',
        data: customerFeatures(customers, routes),
        cluster: true,
        clusterRadius: 24,
        clusterMaxZoom: 8,
      });
      map.addSource('cluster-badges', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'customer-clusters', type: 'symbol', source: 'cluster-badges',
        layout: {
          'icon-image': ['concat', 'cluster-', ['to-string', ['get', 'point_count']]],
          'icon-size': CLUSTER_MARKER_SIZE,
          'icon-offset': ['get', 'offset'],
          'icon-allow-overlap': true,
        },
      });
      map.addLayer({
        id: 'customer-points', type: 'symbol', source: 'customers-all',
        filter: ['!', ['has', 'point_count']],
        layout: { 'icon-image': ['get', 'iconAll'], 'icon-size': CUSTOMER_MARKER_SIZE, 'icon-allow-overlap': true },
      });
      map.addSource('customers-selected', { type: 'geojson', data: customerFeatures(customers, routes, '__none__') });
      map.addLayer({
        id: 'customer-points-selected', type: 'symbol', source: 'customers-selected',
        layout: { 'icon-image': ['get', 'iconRoute'], 'icon-size': CUSTOMER_MARKER_SIZE_SELECTED, 'icon-allow-overlap': true, visibility: 'none' },
      });
      map.addSource('depots', { type: 'geojson', data: depotFeatures(depots) });
      map.addLayer({
        id: 'depot-points', type: 'symbol', source: 'depots',
        layout: { 'icon-image': 'depot-marker', 'icon-size': DEPOT_MARKER_SIZE, 'icon-allow-overlap': true },
      });
      if (selectedRouteRef.current) applyRouteSelection(map, customers, routes, selectedRouteRef.current);
    };
    map.on('style.load', addOverlay);

    // Layer-scoped listeners stay registered across style changes, so they are bound once.
    map.once('load', () => {
      routes.forEach((route) => map.on('click', `route-line-${route.id}`, () => onSelectRoute(route.id)));
      const interactiveLayers = ['customer-points', 'customer-points-selected', 'depot-points'];
      interactiveLayers.forEach((layerId) => {
        map.on('mouseenter', layerId, (event) => {
          map.getCanvas().style.cursor = 'pointer';
          showPointPopup(map, popup, event, layerId === 'depot-points' ? 'depot' : 'customer');
        });
        map.on('mouseleave', layerId, () => {
          map.getCanvas().style.cursor = '';
          popup.remove();
        });
      });
      map.on('click', 'customer-points', (event) => {
        const properties = event.features?.[0]?.properties as Record<string, string> | undefined;
        if (!properties) return;
        if (properties.routeId) onSelectRoute(properties.routeId);
        onSelectCustomer(properties.id);
      });
      map.on('click', 'customer-points-selected', (event) => {
        const properties = event.features?.[0]?.properties as Record<string, string> | undefined;
        if (properties) onSelectCustomer(properties.id);
      });
      map.on('click', 'customer-clusters', (event) => {
        const feature = event.features?.[0];
        if (!feature || feature.geometry.type !== 'Point') return;
        const source = map.getSource('customers-all') as GeoJSONSource;
        const clusterId = Number(feature.properties?.cluster_id);
        void source.getClusterExpansionZoom(clusterId).then((zoom) => {
          map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom });
        });
      });
      map.on('mouseenter', 'customer-clusters', (event) => {
        map.getCanvas().style.cursor = 'zoom-in';
        const feature = event.features?.[0];
        if (!feature || feature.geometry.type !== 'Point') return;
        const count = Number(feature.properties?.point_count);
        // Anchor the tooltip on the badge itself, which may sit away from the cluster point.
        const rawOffset = feature.properties?.offset;
        const [offsetX, offsetY] = (typeof rawOffset === 'string' ? JSON.parse(rawOffset) : rawOffset || [0, 0]) as [number, number];
        const clusterPoint = map.project(feature.geometry.coordinates as [number, number]);
        const badgeCenter = map.unproject([clusterPoint.x + offsetX * CLUSTER_MARKER_SIZE, clusterPoint.y + offsetY * CLUSTER_MARKER_SIZE]);
        popup
          .setLngLat(badgeCenter)
          .setHTML(`<strong>${count} nearby customers</strong><small>Click to expand this group</small>`)
          .addTo(map);
      });
      map.on('mouseleave', 'customer-clusters', () => {
        map.getCanvas().style.cursor = '';
        popup.remove();
      });

      const scheduleBadgePlacement = () => {
        if (badgeFrame) return;
        badgeFrame = requestAnimationFrame(() => {
          badgeFrame = 0;
          placeClusterBadges(map, depots);
        });
      };
      map.on('zoom', scheduleBadgePlacement);
      map.on('moveend', scheduleBadgePlacement);
      map.on('resize', scheduleBadgePlacement);
      map.on('sourcedata', (event) => {
        if (event.sourceId === 'customers-all' && event.isSourceLoaded) scheduleBadgePlacement();
      });

      fitMap(map, depots, customers, routes, selectedRouteRef.current, false);
    });

    mapRef.current = map;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);

    return () => {
      if (badgeFrame) cancelAnimationFrame(badgeFrame);
      observer.disconnect();
      popup.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [customers, depots, onSelectCustomer, onSelectRoute, routes]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource('customers-selected')) return;
    applyRouteSelection(map, customers, routes, selectedRouteId);
    fitMap(map, depots, customers, routes, selectedRouteId, true);
  }, [customers, depots, routes, selectedRouteId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    fitMap(map, depots, customers, routes, selectedRouteRef.current, true);
  }, [customers, depots, fitRequest, routes]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleDarkRef.current === dark) return;
    styleDarkRef.current = dark;
    // A full replace (no diff) drops the old images and layers; addOverlay restores them on style.load.
    map.setStyle(basemapStyle(dark), { diff: false });
  }, [dark]);

  return <div ref={containerRef} className="map-canvas" aria-label="Interactive route map" />;
}
